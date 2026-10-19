import test from 'node:test';
import assert from 'node:assert/strict';
import { checkpointContext, checkpointDay, parseCheckpoint, recoverTimer, type TimerCheckpoint } from '../src/lib/timer-checkpoint.ts';
import type { TeamState } from '../src/types/team.ts';

const now = new Date('2026-10-19T09:00:00Z');
const team: TeamState = { roster: [{ id: 'alice', name: 'Alice', present: true, mood: 3, moodUpdatedAt: now.toISOString() }, { id: 'bob', name: 'Bob', present: true, mood: null, moodUpdatedAt: null }], session: ['alice', 'bob'], postponed: ['bob'], duration: 120, warning: 30, sound: false };
function checkpoint(): TimerCheckpoint {
  return { version: 1, day: checkpointDay(now), context: checkpointContext(team), session: team.session, postponed: ['bob'], roundId: null,
    timer: { people: team.roster.map(person => ({ ...person, done: false, started: person.id === 'alice', speakingSeconds: person.id === 'alice' ? 20 : 0, budgetSeconds: person.id === 'alice' ? 120 : 0, timeUp: false, attempts: person.id === 'alice' ? 1 : 0, postponed: person.id === 'bob' })), activeId: 'alice', previousId: null, remaining: 100, turnTotal: 120, running: true, turnStarted: true, focusMode: true, managing: false, ended: false, warned: false, deadline: now.getTime() + 100000 } };
}

test('checkpoint restores transient lineup against authoritative roster before route guards', () => {
  const durable = { ...team, session: [], postponed: [] };
  const saved = parseCheckpoint(JSON.stringify(checkpoint()), durable, now);
  assert.deepEqual(saved?.session, ['alice', 'bob']);
  assert.deepEqual(saved?.postponed, ['bob']);
  assert.equal(saved?.timer.people[0].name, 'Alice');
});

test('refresh accounts for background elapsed time and overtime without double counting', () => {
  const restored = recoverTimer(checkpoint().timer, now.getTime() + 130000);
  assert.equal(restored.remaining, -30);
  assert.equal(restored.people[0].speakingSeconds, 150);
  assert.equal(restored.people[0].timeUp, true);
  assert.equal(restored.people[1].speakingSeconds, 0);
  assert.equal(restored.running, true);
  assert.deepEqual(recoverTimer(restored, now.getTime() + 130000), restored);
});

test('paused refresh excludes time away and closes management without resuming', () => {
  const saved = checkpoint();
  saved.timer.running = false;
  saved.timer.managing = true;
  const parsed = parseCheckpoint(JSON.stringify(saved), team, now)!;
  assert.equal(parsed.timer.managing, false);
  assert.equal(recoverTimer(parsed.timer, now.getTime() + 600000).remaining, 100);
  assert.equal(parsed.timer.people[0].attempts, 1);
});

test('checkpoint rejects stale day, roster edits, invalid data and different team context', () => {
  assert.equal(parseCheckpoint('{broken', team, now), null);
  assert.equal(parseCheckpoint(JSON.stringify(checkpoint()), team, new Date('2026-10-20T09:00:00Z')), null);
  assert.equal(parseCheckpoint(JSON.stringify(checkpoint()), { ...team, duration: 60 }, now), null);
  assert.equal(parseCheckpoint(JSON.stringify(checkpoint()), { ...team, roster: team.roster.map(p => ({ ...p, present: false })) }, now), null);
  const saved = checkpoint();
  saved.timer.activeId = 'not-in-team';
  assert.equal(parseCheckpoint(JSON.stringify(saved), team, now), null);
  saved.timer.activeId = 'alice';
  saved.timer.people[0].speakingSeconds = -1;
  assert.equal(parseCheckpoint(JSON.stringify(saved), team, now), null);
});

test('completed checkpoint preserves idempotent archive identity and speaker metrics', () => {
  const saved = checkpoint();
  saved.roundId = 'round-stable';
  saved.timer.running = false;
  saved.timer.activeId = null;
  saved.timer.people = saved.timer.people.map(person => ({ ...person, done: true, postponed: false }));
  assert.equal(parseCheckpoint(JSON.stringify(saved), team, now)?.roundId, 'round-stable');
});