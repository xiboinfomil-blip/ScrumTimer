import { parseMoodMeterCatalog, type MoodMeterDeck } from './mood-meter';

export async function loadMoodCatalog(signal: AbortSignal): Promise<MoodMeterDeck[]> {
  const response = await fetch('/mood-meters/catalog.json', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Catalogue indisponible.');
  const value = await response.json();
  if (value?.remote === true) {
    const remote = await fetch('/api/mood-meters/catalog', { signal, cache: 'no-store' });
    if (!remote.ok) {
      const failure = await remote.json().catch(() => null);
      throw new Error(typeof failure?.error === 'string' ? failure.error : 'Catalogue Google indisponible.');
    }
    return parseMoodMeterCatalog(await remote.json());
  }
  return parseMoodMeterCatalog(value);
}

export async function loadMoodDeck(deck: MoodMeterDeck, signal: AbortSignal): Promise<MoodMeterDeck> {
  if (!deck.remoteId) return deck;
  const response = await fetch(`/api/mood-meters/decks/${deck.remoteId}`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Présentation Google indisponible.');
  const [loaded] = parseMoodMeterCatalog([await response.json()]);
  if (!loaded?.slides.length) throw new Error('Présentation invalide.');
  return { ...loaded, title: deck.title, remoteId: deck.remoteId, category: deck.category };
}