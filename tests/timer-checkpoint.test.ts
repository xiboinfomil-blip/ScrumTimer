import test from 'node:test';
import assert from 'node:assert/strict';
import { checkpointContext, checkpointDay, parseCheckpoint, penalizeCurrentTimer, previousSpeaker, previousTimer, recoverTimer, restartCurrentTimer, type TimerCheckpoint } from '../src/lib/timer/timer-checkpoint.ts';
import { MAX_MANUAL_PENALTY, scoreSpeaker, speakerScoreProgress } from '../src/lib/history/session-results.ts';
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

test('previous speaker reopens the prior eligible turn paused without discarding either speaker metrics', () => {
  const timer = checkpoint().timer;
  timer.people = timer.people.map(person => ({ ...person, postponed: false, mood: 2, done: person.id === 'alice', manualPenalty: 50 }));
  timer.activeId = 'bob';
  timer.people[1] = { ...timer.people[1], started: true, attempts: 1, budgetSeconds: 120 };
  const current = recoverTimer(timer, now.getTime() + 130000);
  const previous = previousTimer(current);
  assert.equal(previous.activeId, 'alice');
  assert.equal(previous.previousId, 'bob');
  assert.equal(previous.people[0].done, false);
  assert.deepEqual(previous.people[0], { ...current.people[0], done: false });
  assert.equal(previous.people[1], current.people[1]);
  assert.equal(previous.people[1].speakingSeconds, 130);
  assert.equal(previous.people[1].done, false);
  assert.equal(previous.remaining, 120);
  assert.equal(previous.turnTotal, 120);
  assert.equal(previous.running, false);
  assert.equal(previous.turnStarted, false);
  assert.equal(previous.focusMode, true);
  assert.equal(previous.ended, false);
  assert.equal(previous.warned, false);
  assert.equal(previous.deadline, 0);
  assert.equal(previousTimer(previous), previous);
  assert.equal(previousSpeaker(previous), undefined);
});

test('previous speaker skips postponed turns and never wraps or reopens a completed meeting', () => {
  const timer = checkpoint().timer;
  timer.people.push({ ...timer.people[0], id: 'charlie', name: 'Charlie', done: false });
  timer.activeId = 'charlie';
  assert.equal(previousSpeaker(timer)?.id, 'alice');
  assert.equal(previousTimer(timer, 60).remaining, 60);
  for (const blocked of [{ ...timer, activeId: null }, { ...timer, activeId: 'missing' }, { ...timer, activeId: 'alice' }, { ...timer, managing: true }, { ...timer, people: timer.people.map(person => ({ ...person, postponed: true })) }]) {
    assert.equal(previousSpeaker(blocked), undefined);
    assert.equal(previousTimer(blocked), blocked);
  }
});

test('manual penalty targets only the current speaker, repeats by 50 and retains countdown/focus/metrics', () => {
  const current = checkpoint().timer;
  const once = penalizeCurrentTimer(current);
  const twice = penalizeCurrentTimer(once);
  assert.equal(once.people[0].manualPenalty, 50);
  assert.equal(twice.people[0].manualPenalty, 100);
  assert.equal(current.people[0].manualPenalty, undefined);
  assert.equal(twice.people[1], current.people[1]);
  assert.deepEqual(twice, { ...current, people: [{ ...current.people[0], manualPenalty: 100 }, current.people[1]] });
  assert.equal(speakerScoreProgress(current.people[0]).score, 150);
  assert.equal(speakerScoreProgress(twice.people[0]).score, 50);
  assert.equal(scoreSpeaker({ ...twice.people[0], done: true }), 50);
});

test('checkpoint keeps optional legacy penalties and validates present manual penalties as bounded integers', () => {
  const legacy = parseCheckpoint(JSON.stringify(checkpoint()), team, now)!;
  assert.equal(legacy.timer.people[0].manualPenalty, undefined);
  for (const manualPenalty of [0, 50, 125, MAX_MANUAL_PENALTY]) {
    const saved = checkpoint();
    saved.timer.people[0].manualPenalty = manualPenalty;
    assert.equal(parseCheckpoint(JSON.stringify(saved), team, now)?.timer.people[0].manualPenalty, manualPenalty);
  }
  for (const manualPenalty of [-1, .5, MAX_MANUAL_PENALTY + 1, null, '50', true]) {
    const saved = checkpoint();
    Object.assign(saved.timer.people[0], { manualPenalty });
    assert.equal(parseCheckpoint(JSON.stringify(saved), team, now), null);
  }
  for (const manualPenalty of [NaN, Infinity]) {
    const saved = checkpoint();
    saved.timer.people[0].manualPenalty = manualPenalty;
    assert.equal(parseCheckpoint(JSON.stringify(saved), team, now), null);
  }
});

test('focus restart pauses at full duration while retaining metrics, penalties, identity and other speakers', () => {
  const saved = checkpoint();
  saved.roundId = 'round-stable';
  const elapsed = recoverTimer(saved.timer, now.getTime() + 130000);
  const penalized = penalizeCurrentTimer(elapsed);
  const restarted = restartCurrentTimer(penalized, team.duration);
  assert.equal(restarted.remaining, 120);
  assert.equal(restarted.turnTotal, 120);
  assert.equal(restarted.running, false);
  assert.equal(restarted.turnStarted, false);
  assert.equal(restarted.focusMode, true);
  assert.equal(restarted.deadline, 0);
  assert.equal(restarted.ended, false);
  assert.equal(restarted.warned, false);
  assert.equal(restarted.people, penalized.people);
  assert.equal(restarted.people[0].speakingSeconds, 150);
  assert.equal(restarted.people[0].budgetSeconds, 120);
  assert.equal(restarted.people[0].timeUp, true);
  assert.equal(restarted.people[0].attempts, 1);
  assert.equal(restarted.people[0].manualPenalty, 50);
  assert.equal(restarted.people[1], saved.timer.people[1]);
  assert.equal(restarted.activeId, saved.timer.activeId);
  const parsed = parseCheckpoint(JSON.stringify({ ...saved, timer: restarted }), team, now)!;
  assert.equal(parsed.roundId, 'round-stable');
  assert.deepEqual(recoverTimer(parsed.timer, now.getTime() + 600000), restarted);
  assert.equal(restartCurrentTimer(restarted).people[0].attempts, 1);
});

test('running refresh retains deductions and completed checkpoint retains its exact final score', () => {
  const saved = checkpoint();
  saved.timer = penalizeCurrentTimer(penalizeCurrentTimer(saved.timer));
  const parsed = parseCheckpoint(JSON.stringify(saved), team, now)!;
  const recovered = recoverTimer(parsed.timer, now.getTime() + 85000);
  assert.equal(recovered.people[0].manualPenalty, 100);
  assert.equal(recovered.people[0].speakingSeconds, 105);
  assert.equal(speakerScoreProgress(recovered.people[0]).score, 900);
  saved.roundId = 'round-penalized';
  saved.timer = { ...recovered, running: false, activeId: null, people: recovered.people.map(person => ({ ...person, done: true })) };
  const completed = parseCheckpoint(JSON.stringify(saved), team, now)!;
  assert.equal(completed.roundId, 'round-penalized');
  assert.equal(scoreSpeaker(completed.timer.people[0]), 900);
});

test('current actions ignore no speaker, completed and postponed targets and bound penalty accumulation', () => {
  const timer = checkpoint().timer;
  for (const current of [{ ...timer, activeId: null }, { ...timer, activeId: 'bob' }, { ...timer, people: timer.people.map(person => ({ ...person, done: true })) }]) {
    assert.equal(penalizeCurrentTimer(current), current);
    assert.equal(restartCurrentTimer(current), current);
  }
  const bounded = { ...timer, people: timer.people.map(person => ({ ...person, manualPenalty: MAX_MANUAL_PENALTY })) };
  assert.equal(penalizeCurrentTimer(bounded), bounded);
  const lastClick = { ...timer, people: timer.people.map(person => ({ ...person, manualPenalty: MAX_MANUAL_PENALTY - 50 })) };
  assert.equal(penalizeCurrentTimer(lastClick).people[0].manualPenalty, MAX_MANUAL_PENALTY);
});