import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { loadCachedMoodPages, MOOD_CACHE_WEEK_MS, readMoodFetchCache } from '../src/lib/mood-fetch-cache.ts';

test('PostgreSQL cache: shared hits, seven-day purge, failures, concurrent fills and domain isolation', async () => {
  const engine = new PGlite();
  try {
    for (const name of ['0000_spotty_the_stranger', '0001_abandoned_snowbird', '0002_workspace_daily_meters', '0003_remote_mood_cache']) {
      await engine.exec(readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8'));
    }
    const team = 'a'.repeat(64);
    await engine.query('INSERT INTO workspaces(id) VALUES($1)', [team]);
    await engine.query("INSERT INTO teams(id,workspace_id,name,duration,warning,sound) VALUES($1,$1,'Permanent team',120,30,true)", [team]);
    await engine.query("INSERT INTO participants(team_id,id,name) VALUES($1,'person','Permanent person')", [team]);
    await engine.query("INSERT INTO standup_sessions(team_id,id,completed_at) VALUES($1,'history',now())", [team]);
    const dialect = new PgDialect();
    const client = {
      execute: (query: SQL) => ({ query, then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        const compiled = dialect.sqlToQuery(query);
        return engine.query(compiled.sql, compiled.params).then(resolve, reject);
      } }),
      batch: (queries: { query: SQL }[]) => engine.transaction(async tx => {
        const results = [];
        for (const { query } of queries) {
          const compiled = dialect.sqlToQuery(query);
          results.push(await tx.query(compiled.sql, compiled.params));
        }
        return results;
      }),
    } as unknown as Parameters<typeof readMoodFetchCache>[0];
    const source = [
      { id: 'deck-11111111111111111111', googleId: 'publicGoogleId', title: 'Animals', category: 'Animals & Creatures' },
      { id: 'deck-22222222222222222222', googleId: 'anotherGoogleId', title: 'Movies', category: 'Movies' },
    ];
    const start = new Date('2026-10-15T10:00:00Z');
    const before = new Date(start.getTime() + MOOD_CACHE_WEEK_MS - 1);
    const expiry = new Date(start.getTime() + MOOD_CACHE_WEEK_MS);
    let requests = 0;
    const fetcher = async (googleId: string) => { requests++; assert.equal(googleId, source[0].googleId); return ['first', 'second']; };
    let catalogueFetches = 0;
    const upstream = async () => { catalogueFetches++; return source; };
    assert.equal((await readMoodFetchCache(client, upstream, start)).length, 2);
    assert.equal((await readMoodFetchCache(client, upstream, before)).length, 2);
    assert.equal(catalogueFetches, 1, 'empty database fetches once and subsequent loads use saved categories');
    await assert.rejects(readMoodFetchCache(client, async () => { throw new Error('Source unavailable'); }, expiry));
    assert.equal((await engine.query('SELECT count(*)::int AS n FROM remote_mood_catalog')).rows[0].n, 2, 'failed refresh preserves saved catalogue');
    const first = await loadCachedMoodPages(client, source, source[0].id, fetcher, start);
    assert.deepEqual(first?.pages, ['first', 'second']);
    assert.equal(first?.category, source[0].category);
    // A new server/device can read without invoking Google at all.
    assert.deepEqual((await loadCachedMoodPages(client, source, source[0].id, fetcher, before))?.pages, first?.pages);
    assert.equal(requests, 1);
    await assert.rejects(loadCachedMoodPages(client, source, source[1].id, async () => { throw new Error('Google unavailable'); }, before));
    assert.equal((await readMoodFetchCache(client, source, before))[1].loaded_at, null);
    await assert.rejects(loadCachedMoodPages(client, source, source[1].id, async () => ['../unsafe'], before));
    assert.equal(await loadCachedMoodPages(client, source, 'unknown', fetcher, before), null);

    const refreshedSource = source.map(entry => ({ ...entry, title: `${entry.title} refreshed` }));
    const expired = await readMoodFetchCache(client, refreshedSource, expiry);
    assert.notEqual(expired[0].generation, first?.generation);
    assert.ok(expired.every(entry => entry.loaded_at === null));
    assert.equal((await engine.query('SELECT count(*)::int AS n FROM remote_mood_pages')).rows[0].n, 0, 'ALL resolved URLs cleared together at seven days');
    assert.equal(expired[0].title, 'Animals refreshed');
    assert.equal((await loadCachedMoodPages(client, source, source[0].id, fetcher, expiry))?.pages.length, 2);
    assert.equal(requests, 2);

    const concurrent = await Promise.all([
      loadCachedMoodPages(client, source, source[1].id, async () => ['winnerA'], expiry),
      loadCachedMoodPages(client, source, source[1].id, async () => ['winnerB'], expiry),
    ]);
    assert.deepEqual(concurrent[0]?.pages, concurrent[1]?.pages, 'first fill wins without mixing page lists');

    // Expire the cache while a remote request is in flight. Old work cannot
    // populate the replacement generation after the weekly deletion.
    const nextWeek = new Date(expiry.getTime() + MOOD_CACHE_WEEK_MS);
    await readMoodFetchCache(client, source, nextWeek);
    await assert.rejects(loadCachedMoodPages(client, source, source[0].id, async () => {
      await readMoodFetchCache(client, source, new Date(nextWeek.getTime() + MOOD_CACHE_WEEK_MS));
      return ['stale'];
    }, nextWeek), /expired during fetch/);
    assert.equal((await engine.query('SELECT count(*)::int AS n FROM remote_mood_pages')).rows[0].n, 0);
    for (const table of ['teams', 'participants', 'standup_sessions']) {
      assert.equal((await engine.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 1, `${table} untouched by cache purge`);
    }
    assert.equal((await engine.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('json','jsonb')")).rows[0].n, 0);
  } finally { await engine.close(); }
});