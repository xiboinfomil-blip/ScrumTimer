import test from 'node:test';
import assert from 'node:assert/strict';
import { liveRemaining, validateLiveSnapshot } from '../src/lib/live-session.ts';
const snapshot = { speaker: '<Alice>', nextSpeaker: 'Bob', teamName: 'Équipe', running: true, remaining: 30, deadline: 40_000, completed: 1, total: 3 };
test('live snapshots use bounded text and strict finite runtime state, without moods', () => {
  assert.deepEqual(validateLiveSnapshot(snapshot), snapshot);
  for (const change of [{ speaker: 'a'.repeat(101) }, { total: 0 }, { completed: 0.5 }, { remaining: Infinity }, { running: 'yes' }, { mood: 1 }, { deadline: -1 }, { speaker: '\nAlice' }]) assert.throws(() => validateLiveSnapshot({ ...snapshot, ...change }));
});
test('spectators derive signed countdown from server-aligned deadlines, freeze on pause', () => {
  assert.equal(liveRemaining(snapshot, 15_000), 25);
  assert.equal(liveRemaining(snapshot, 45_000), -5);
  assert.equal(liveRemaining({ ...snapshot, running: false }, 90_000), 30);
});