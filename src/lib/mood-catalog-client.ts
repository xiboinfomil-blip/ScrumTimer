import { parseMoodMeterCatalog, type MoodMeterDeck } from './mood-meter';

// Browser-memory only, bounded and short lived. Failures/aborted reads never cache.
let catalogCache: { decks: MoodMeterDeck[]; expires: number } | undefined;
const deckCache = new Map<string, { deck: MoodMeterDeck; expires: number }>();

export async function loadMoodCatalog(signal: AbortSignal): Promise<MoodMeterDeck[]> {
  signal.throwIfAborted();
  if (catalogCache && catalogCache.expires > Date.now()) return catalogCache.decks;
  const response = await fetch('/mood-meters/catalog.json', { signal });
  if (!response.ok) throw new Error('Catalogue indisponible.');
  const value = await response.json();
  if (value?.remote === true) {
    const remote = await fetch('/api/mood-meters/catalog', { signal, cache: 'no-store' });
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
  const response = await fetch(`/api/mood-meters/decks/${deck.remoteId}`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Présentation Google indisponible.');
  const [loaded] = parseMoodMeterCatalog([await response.json()]);
  if (!loaded?.slides.length) throw new Error('Présentation invalide.');
  signal.throwIfAborted();
  for (const [key, entry] of deckCache) if (entry.expires <= Date.now()) deckCache.delete(key);
  if (deckCache.size >= 20) deckCache.delete(deckCache.keys().next().value!);
  deckCache.set(deck.remoteId, { deck: loaded, expires: Date.now() + 300_000 });
  return { ...loaded, title: deck.title, remoteId: deck.remoteId, category: deck.category };
}