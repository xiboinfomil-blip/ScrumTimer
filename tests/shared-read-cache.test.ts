import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { SharedReadCache, teamReadKey } from '../src/lib/persistence/shared-read-cache.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

test('shared cache coalesces identical reads, isolates keys, clones values and expires', async () => {
  let now = 0; let queries = 0;
  const cache = new SharedReadCache(2, () => now);
  const load = async () => { queries++; return { names: ['Alice'] }; };
  const results = await Promise.all(Array.from({ length: 20 }, () => cache.read('team:a', 100, load)));
  assert.equal(queries, 1);
  results[0].names.push('Changed');
  assert.deepEqual(results[1].names, ['Alice']);
  assert.deepEqual((await cache.read('team:a', 100, load)).names, ['Alice']);
  await cache.read('team:b', 100, load);
  assert.equal(queries, 2);
  now = 100;
  await cache.read('team:a', 100, load);
  assert.equal(queries, 3);
  await cache.read('team:c', 100, load);
  await cache.read('team:b', 100, load);
  assert.equal(queries, 5);
});

test('failures and missing values are not cached', async () => {
  const cache = new SharedReadCache(); let calls = 0;
  const fail = async () => { calls++; throw new Error('offline'); };
  await assert.rejects(cache.read('x', 100, fail));
  await assert.rejects(cache.read('x', 100, fail));
  assert.equal(calls, 2);
  const missing = async () => { calls++; return null; };
  await cache.read('x', 100, missing); await cache.read('x', 100, missing);
  assert.equal(calls, 4);
});

test('mutations invalidate before and after, bypass reads and prevent stale in-flight refill', async () => {
  const cache = new SharedReadCache();
  const stale = deferred<string>(); const write = deferred<void>();
  const oldRead = cache.read('x', 1000, () => stale.promise);
  const mutation = cache.mutate(() => write.promise);
  assert.equal(await cache.read('x', 1000, async () => 'during'), 'during');
  write.resolve(); await mutation;
  assert.equal(await cache.read('x', 1000, async () => 'fresh'), 'fresh');
  stale.resolve('old'); await oldRead;
  assert.equal(await cache.read('x', 1000, async () => 'wrong'), 'fresh');
  await assert.rejects(cache.mutate(async () => { throw new Error('uncertain commit'); }));
  assert.equal(await cache.read('x', 1000, async () => 'recovered'), 'recovered');
});

test('overlapping writes cannot refill the cache before all writes finish', async () => {
  const cache = new SharedReadCache(); const a = deferred<void>(); const b = deferred<void>();
  const first = cache.mutate(() => a.promise); const second = cache.mutate(() => b.promise);
  a.resolve(); await first;
  await cache.read('x', 1000, async () => 'intermediate');
  b.resolve(); await second;
  assert.equal(await cache.read('x', 1000, async () => 'final'), 'final');
});

test('keys cross both daily boundaries and preserve team isolation', () => {
  const key = (time: string) => teamReadKey('history', 'a', new Date(time));
  assert.notEqual(key('2026-10-15T19:59:59Z'), key('2026-10-15T20:00:00Z'));
  assert.notEqual(key('2026-10-15T23:59:59Z'), key('2026-10-16T00:00:00Z'));
  assert.notEqual(teamReadKey('team', 'a'), teamReadKey('team', 'b'));
});

test('every durable mutation route invalidates shared reads; writes keep direct identity validation', () => {
  for (const route of ['team', 'teams', 'history', 'daily-meter', 'meeting-settings']) {
    const source = readFileSync(new URL(`../src/app/api/${route}/route.ts`, import.meta.url), 'utf8');
    assert.match(source, /teamReadCache\.mutate\(/, route);
    assert.match(source, /teamReadCache\.read\(/, route);
  }
  const source = readFileSync(new URL('../src/lib/persistence/database.ts', import.meta.url), 'utf8');
  assert.match(source, /request.method === 'GET'/);
  assert.match(source, /: load\(\)/);
});