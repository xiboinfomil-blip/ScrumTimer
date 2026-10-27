import { parseMoodMeterCatalog, type MoodMeterDeck } from './mood-meter.ts';
import { fetchMoodRead } from './mood-retry.ts';

let catalogCache: { decks: MoodMeterDeck[]; expires: number } | undefined;
let catalogPending: Promise<MoodMeterDeck[]> | undefined;
const deckCache = new Map<string, { deck: MoodMeterDeck; expires: number }>();
const deckPending = new Map<string, Promise<MoodMeterDeck>>();

export async function loadMoodCatalog(signal: AbortSignal): Promise<MoodMeterDeck[]> {
  signal.throwIfAborted();
  if (catalogCache && catalogCache.expires > Date.now()) return catalogCache.decks;
  const pending = catalogPending ??= readMoodCatalog(AbortSignal.timeout(45_000));
  try { const decks = await pending; signal.throwIfAborted(); return decks; }
  finally { if (catalogPending === pending) catalogPending = undefined; }
}

async function readMoodCatalog(signal: AbortSignal): Promise<MoodMeterDeck[]> {
  const response = await fetchMoodRead('/mood-meters/catalog.json', signal);
  if (!response.ok) throw new Error('Catalogue indisponible.');
  const value = await response.json();
  if (value?.remote === true) {
    const remote = await fetchMoodRead('/api/mood-meters/catalog', signal);
    if (!remote.ok) {
      const failure = await remote.json().catch(() => null);
      throw new Error(typeof failure?.error === 'string' ? failure.error : 'Catalogue Google indisponible.');
    }
    const decks = parseMoodMeterCatalog(await remote.json());
    signal.throwIfAborted();
    catalogCache = { decks, expires: Date.now() + 60_000 };
    return decks;
  }
  const decks = parseMoodMeterCatalog(value);
  catalogCache = { decks, expires: Date.now() + 60_000 };
  return decks;
}

export async function loadMoodDeck(deck: MoodMeterDeck, signal: AbortSignal): Promise<MoodMeterDeck> {
  if (!deck.remoteId) return deck;
  signal.throwIfAborted();
  const cached = deckCache.get(deck.remoteId);
  if (cached && cached.expires > Date.now()) return { ...cached.deck, title: deck.title, remoteId: deck.remoteId, category: deck.category };
  let pending = deckPending.get(deck.remoteId);
  if (!pending) {
    pending = readMoodDeck(deck.remoteId, AbortSignal.timeout(45_000));
    if (deckPending.size >= 20) deckPending.delete(deckPending.keys().next().value!);
    deckPending.set(deck.remoteId, pending);
  }
  try {
    const loaded = await pending;
    signal.throwIfAborted();
    return { ...loaded, title: deck.title, remoteId: deck.remoteId, category: deck.category };
  } finally { if (deckPending.get(deck.remoteId) === pending) deckPending.delete(deck.remoteId); }
}

async function readMoodDeck(remoteId: string, signal: AbortSignal): Promise<MoodMeterDeck> {
  const response = await fetchMoodRead(`/api/mood-meters/decks/${remoteId}`, signal);
  if (!response.ok) throw new Error('Présentation Google indisponible.');
  const [loaded] = parseMoodMeterCatalog([await response.json()]);
  if (!loaded?.slides.length) throw new Error('Présentation invalide.');
  signal.throwIfAborted();
  for (const [key, entry] of deckCache) if (entry.expires <= Date.now()) deckCache.delete(key);
  if (deckCache.size >= 20) deckCache.delete(deckCache.keys().next().value!);
  deckCache.set(remoteId, { deck: loaded, expires: Date.now() + 300_000 });
  return loaded;
}