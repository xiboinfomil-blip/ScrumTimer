import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchMoodRead, MOOD_RETRY_DELAYS, retryDelay } from '../src/lib/mood-retry.ts';

test('mood reads retry three times with Fibonacci 1,1,2 second delays', async t => {
  assert.deepEqual([...MOOD_RETRY_DELAYS], [1000, 1000, 2000]);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(null, { status: calls < 4 ? 503 : 200 }); });
  const result = fetchMoodRead('/deck', new AbortController().signal);
  const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
  await flush(); assert.equal(calls, 1);
  for (const delay of MOOD_RETRY_DELAYS) { t.mock.timers.tick(delay); await flush(); }
  assert.equal((await result).status, 200); assert.equal(calls, 4);
});

test('mood retries stop after three and never retry access refusals', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const mock = t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(null, { status: 503 }); });
  const result = fetchMoodRead('/deck', new AbortController().signal);
  const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
  await flush();
  for (const delay of MOOD_RETRY_DELAYS) { t.mock.timers.tick(delay); await flush(); }
  assert.equal((await result).status, 503); assert.equal(calls, 4);
  mock.mock.mockImplementation(async () => { calls++; return new Response(null, { status: 403 }); });
  assert.equal((await fetchMoodRead('/deck', new AbortController().signal)).status, 403);
  assert.equal(calls, 5);
});

test('aborting a backoff cancels further requests', async () => {
  const controller = new AbortController();
  const wait = retryDelay(1000, controller.signal);
  controller.abort();
  await assert.rejects(wait, { name: 'AbortError' });
});