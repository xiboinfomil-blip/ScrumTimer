import assert from 'node:assert/strict';
import test from 'node:test';
import { CLOUD_REQUEST_TIMEOUT_MS, CloudRequestError, cloudFetch, cloudRetryDelay, isTransientCloudError, parseRetryAfter, sameCloudTeam } from '../src/lib/persistence/cloud-retry.ts';
import { defaultTeam } from '../src/lib/team/team-storage.ts';

test('exponential backoff starts at one second and remains capped indefinitely', () => {
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => cloudRetryDelay(i)), [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  assert.equal(cloudRetryDelay(100000), 30000);
  assert.equal(cloudRetryDelay(0, 45000), 45000);
  assert.equal(cloudRetryDelay(0, Number.MAX_VALUE), 2147483647);
});

test('only transient HTTP statuses retry; never blindly retry conflicts or auth/validation errors', () => {
  for (const status of [408, 425, 429, 500, 502, 503, 504, 599]) {
    assert.equal(isTransientCloudError(new CloudRequestError(new Response(null, { status }))), true, String(status));
  }
  for (const status of [400, 401, 403, 404, 409, 422, 507]) {
    assert.equal(isTransientCloudError(new CloudRequestError(new Response(null, { status }))), false, String(status));
  }
  assert.equal(isTransientCloudError(new TypeError('Failed to fetch')), true);
  assert.equal(isTransientCloudError(new DOMException('timeout', 'AbortError')), true);
  assert.equal(isTransientCloudError(new DOMException('timeout', 'TimeoutError')), true);
  assert.equal(isTransientCloudError(new SyntaxError('invalid JSON')), false);
  assert.equal(isTransientCloudError(new Error('invalid payload')), false);
});

test('Retry-After supports seconds and HTTP dates without retrying invalid values', () => {
  const now = Date.UTC(2026, 9, 19);
  assert.equal(parseRetryAfter('2'), 2000);
  assert.equal(parseRetryAfter(new Date(now + 60000).toUTCString(), now), 60000);
  for (const value of [null, '', ' ', '-1', 'nonsense']) assert.equal(parseRetryAfter(value, now), null);
});

test('cloud transport retains HTTP status/cooldown and exposes 409 for reconciliation', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 503, headers: { 'Retry-After': '12' } });
    await assert.rejects(cloudFetch('/api/team'), error => error instanceof CloudRequestError && error.status === 503 && error.retryAfter === 12000);
    globalThis.fetch = async () => new Response(null, { status: 409 });
    assert.equal((await cloudFetch('/api/team')).status, 409);
    globalThis.fetch = async () => { throw new TypeError('offline'); };
    await assert.rejects(cloudFetch('/api/team'), TypeError);
  } finally { globalThis.fetch = original; }
});

test('cloud requests have independent deadlines longer than the Windows proxy and preserve caller cancellation', async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  const deadlines: AbortController[] = [];
  const signals: AbortSignal[] = [];
  AbortSignal.timeout = milliseconds => {
    assert.equal(milliseconds, CLOUD_REQUEST_TIMEOUT_MS);
    assert.ok(milliseconds > 45_000);
    const deadline = new AbortController();
    deadlines.push(deadline);
    return deadline.signal;
  };
  globalThis.fetch = async (_, options) => {
    const signal = options!.signal!;
    signals.push(signal);
    return new Promise<Response>((_, reject) => {
      signal.throwIfAborted();
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  try {
    const caller = new AbortController();
    const first = cloudFetch('/api/team', { signal: caller.signal });
    const second = cloudFetch('/api/history', { signal: caller.signal });
    assert.notEqual(signals[0], signals[1]);
    deadlines[0].abort(new DOMException('Deadline expired', 'TimeoutError'));
    await assert.rejects(first, { name: 'TimeoutError' });
    assert.equal(signals[1].aborted, false);
    assert.equal(caller.signal.aborted, false);
    caller.abort();
    await assert.rejects(second, { name: 'AbortError' });
  } finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; }
});

test('acknowledgement comparison ignores transient state, not genuine durable conflicts', () => {
  const submitted = defaultTeam();
  assert.equal(sameCloudTeam(submitted, { ...submitted, postponed: [] }), true);
  assert.equal(sameCloudTeam(submitted, { ...submitted, duration: submitted.duration + 1 }), false);
  assert.equal(sameCloudTeam(submitted, { ...submitted, sound: !submitted.sound }), false);
  assert.equal(sameCloudTeam(null, submitted), false);
  assert.equal(sameCloudTeam({ ...submitted, unknown: true }, submitted), false);
  const participant = { id: 'a', name: 'Alice', present: true, mood: 2, moodUpdatedAt: null, moodSlide: null };
  const saved = { ...submitted, roster: [participant] };
  const latest = { ...saved, session: ['a'], postponed: [] };
  assert.equal(sameCloudTeam(saved, latest), true);
  assert.equal(sameCloudTeam(saved, { ...latest, roster: [{ ...participant, name: 'Bob' }] }), false);
});