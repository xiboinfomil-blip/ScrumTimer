import 'server-only';
import { fetchMoodSource } from './fetch-mood-source';
import { database } from './database';
import { fetchGoogleSlide, parseGoogleSlideIds } from './google-slides';
import { loadCachedMoodPages, readMoodFetchCache } from './mood-fetch-cache';

export async function cachedMoodCatalog() {
  const rows = await readMoodFetchCache(database(), fetchMoodSource);
  return rows.map(({ id, title, category }) => ({ remoteId: id, title, category, slides: [] }));
}

export function cachedMoodDeck(id: string) {
  return loadCachedMoodPages(database(), fetchMoodSource, id, async googleId => parseGoogleSlideIds(await fetchGoogleSlide(googleId, undefined, true)));
}