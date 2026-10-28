import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';

type Database = Pick<NeonHttpDatabase, 'execute' | 'batch'>;
export type RemoteMoodSource = { id: string; googleId: string; title: string; category: string };
export const MOOD_CACHE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Valid live-source hits need only one snapshot read. Cache fills take the same
// singleton lock; deletion and reseeding never expose a half-empty catalogue.
export async function readMoodFetchCache(db: Database, source: RemoteMoodSource[] | (() => Promise<RemoteMoodSource[]>), now = new Date()) {
  if (typeof source === 'function') {
    const hit = await db.execute(sql`SELECT c.id,c.google_id,c.title,c.category,c.loaded_at,s.generation FROM remote_mood_catalog c CROSS JOIN remote_mood_cache_state s WHERE s.id=1 AND s.expires_at>${now.toISOString()}::timestamptz ORDER BY c.title,c.id`);
    if (hit.rows.length) return hit.rows as { id: string; google_id: string; title: string; category: string; loaded_at: string | null; generation: string }[];
    // Fetch before locking/deleting: upstream failure preserves the old cache.
    source = await source();
    if (!source.length) throw new Error('Empty mood catalogue');
  }
  const instant = now.toISOString();
  const generation = randomUUID();
  const expires = new Date(now.getTime() + MOOD_CACHE_WEEK_MS).toISOString();
  const results = await db.batch([
    db.execute(sql`INSERT INTO remote_mood_cache_state(id,generation,expires_at) VALUES(1,${generation},${expires}::timestamptz) ON CONFLICT DO NOTHING`),
    db.execute(sql`SELECT id FROM remote_mood_cache_state WHERE id=1 FOR UPDATE`),
    db.execute(sql`DELETE FROM remote_mood_catalog WHERE EXISTS(SELECT 1 FROM remote_mood_cache_state WHERE id=1 AND expires_at<=${instant}::timestamptz)`),
    db.execute(sql`UPDATE remote_mood_cache_state SET generation=${generation},expires_at=${expires}::timestamptz WHERE id=1 AND expires_at<=${instant}::timestamptz`),
    db.execute(sql`INSERT INTO remote_mood_catalog(id,google_id,title,category) SELECT s.id,s."googleId",s.title,s.category FROM jsonb_to_recordset(${JSON.stringify(source)}::jsonb) AS s(id text,"googleId" text,title text,category text) WHERE NOT EXISTS(SELECT 1 FROM remote_mood_catalog) ON CONFLICT DO NOTHING`),
    db.execute(sql`SELECT c.id,c.google_id,c.title,c.category,c.loaded_at,s.generation FROM remote_mood_catalog c CROSS JOIN remote_mood_cache_state s WHERE s.id=1 ORDER BY c.title,c.id`),
  ]);
  return results[5].rows as { id: string; google_id: string; title: string; category: string; loaded_at: string | null; generation: string }[];
}

export async function loadCachedMoodPages(db: Database, source: RemoteMoodSource[] | (() => Promise<RemoteMoodSource[]>), id: string, load: (googleId: string) => Promise<string[]>, now = new Date()) {
  const rows = await readMoodFetchCache(db, source, now);
  const item = rows.find(row => row.id === id);
  if (!item) return null;
  const read = async () => {
    const result = await db.execute(sql`SELECT p.page_id FROM remote_mood_pages p JOIN remote_mood_catalog c ON c.id=p.deck_id CROSS JOIN remote_mood_cache_state s WHERE p.deck_id=${id} AND s.id=1 AND s.generation=${item.generation} AND c.loaded_at IS NOT NULL ORDER BY p.position`);
    return result.rows.map(row => String(row.page_id));
  };
  if (item.loaded_at) {
    const pages = await read();
    if (pages.length) return { ...item, pages };
  }
  const pages = [...new Set(await load(item.google_id))];
  if (!pages.length || pages.length > 500 || pages.some(page => !/^[\w.-]+$/.test(page) || page.includes('..'))) throw new Error('Invalid public slides');
  // Fetch outside the lock. A fetch crossing weekly expiry must not resurrect
  // last week's URLs. Concurrent fills are first-writer-wins under this lock.
  const gate = sql`EXISTS(SELECT 1 FROM remote_mood_cache_state s JOIN remote_mood_catalog c ON c.id=${id} WHERE s.id=1 AND s.generation=${item.generation} AND c.loaded_at IS NULL)`;
  await db.batch([
    db.execute(sql`SELECT id FROM remote_mood_cache_state WHERE id=1 FOR UPDATE`),
    db.execute(sql`INSERT INTO remote_mood_pages(deck_id,position,page_id) SELECT ${id},p.position,p.page FROM jsonb_to_recordset(${JSON.stringify(pages.map((page, position) => ({ page, position })))}::jsonb) AS p(page text,position integer) WHERE ${gate} ON CONFLICT DO NOTHING`),
    db.execute(sql`UPDATE remote_mood_catalog SET loaded_at=${now.toISOString()}::timestamptz WHERE id=${id} AND ${gate}`),
  ]);
  const stored = await read();
  if (!stored.length) throw new Error('Mood cache expired during fetch; retry');
  return { ...item, pages: stored };
}