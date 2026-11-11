import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
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

test('actual team and history GET routes bypass cached results for authorized reconciliation reads', async () => {
  for (const route of ['team', 'history']) {
    const source = readFileSync(new URL(`../src/app/api/${route}/route.ts`, import.meta.url), 'utf8');
    const cache = new SharedReadCache(); const connection = {};
    let revision = 0, reads = 0, authorizations = 0, allowed = true;
    const load = async (db: unknown, id: string) => {
      assert.equal(db, connection); assert.equal(id, 'fixture-team'); reads++;
      return route === 'team' ? { team: null, revision } : [{ id: `round-${revision}` }];
    };
    const modules: Record<string, unknown> = {
      'next/server': { NextResponse: Response },
      '@/lib/persistence/database': {
        database: () => connection,
        selectedTeam: async () => { authorizations++; if (!allowed) throw new Error('Forbidden'); return 'fixture-team'; },
        databaseFailure: () => new Response(null, { status: 403 }),
      },
      '@/lib/team/team-validation': {},
      '@/lib/persistence/relational-store': { readTeam: load, readHistory: load },
      '@/lib/team/workspace-store': { mauritiusDay: () => '2026-10-15' },
      '@/lib/persistence/shared-read-cache': { teamReadCache: cache, teamReadKey },
      '@/lib/jira/jira-store': {},
    };
    const handlers: { GET?: (request: Request) => Promise<Response> } = {};
    runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports: handlers, require: (name: string) => { assert.ok(Object.hasOwn(modules, name)); return modules[name]; },
    });
    const request = (fresh = false) => new Request(`https://example.test/api/${route}`, { headers: fresh ? { 'X-Team-Refresh': '1' } : {} });
    const initial = await (await handlers.GET!(request())).json();
    revision++;
    assert.deepEqual(await (await handlers.GET!(request())).json(), initial);
    assert.equal(reads, 1);
    const fresh = await handlers.GET!(request(true));
    assert.equal(fresh.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await fresh.json(), route === 'team' ? { team: null, revision: 1 } : { rounds: [{ id: 'round-1' }], day: '2026-10-15' });
    assert.equal(reads, 2);
    allowed = false;
    assert.equal((await handlers.GET!(request(true))).status, 403);
    assert.equal(reads, 2); assert.equal(authorizations, 4);
  }
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