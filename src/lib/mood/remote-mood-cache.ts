import 'server-only';
import { fetchMoodSource } from './fetch-mood-source';
import { database } from '../persistence/database';
import { fetchGoogleSlide, parseGoogleSlideIds } from './google-slides';
import { loadCachedMoodPages, readMoodFetchCache } from './mood-fetch-cache';
import { publicReadCache } from '../persistence/shared-read-cache';

export async function cachedMoodCatalog() {
  return publicReadCache.read('catalog', 60_000, async () => {
    const rows = await readMoodFetchCache(database(), fetchMoodSource);
    return rows.map(({ id, title, category }) => ({ remoteId: id, title, category, slides: [] }));
  });
}

export function cachedMoodDeck(id: string) {
  return publicReadCache.read(`deck:${id}`, 60_000, () =>
    loadCachedMoodPages(database(), fetchMoodSource, id, async googleId => parseGoogleSlideIds(await fetchGoogleSlide(googleId, undefined, true))));
}