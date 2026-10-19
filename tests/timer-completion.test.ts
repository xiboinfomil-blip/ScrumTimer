import test from 'node:test';
import assert from 'node:assert/strict';
import { finishWaitingRound, roundSpeakers, rejoinCheckpoint } from '../src/lib/timer-completion.ts';
import { checkpointContext, checkpointDay, parseCheckpoint, type TimerState } from '../src/lib/timer-checkpoint.ts';
import { completedRound } from '../src/lib/history.ts';
import type { TeamState } from '../src/types/team.ts';

const team: TeamState = { roster: [
  { id: 'alice', name: 'Alice', present: true, mood: 2, moodUpdatedAt: null },
  { id: 'bob', name: 'Bob', present: true, mood: null, moodUpdatedAt: null },
], session: ['alice', 'bob'], postponed: ['bob'], duration: 120, warning: 0, sound: false };
const waiting = (): TimerState => ({ people: team.roster.map(person => ({ ...person, done: person.id === 'alice', postponed: person.id === 'bob', started: person.id === 'alice', speakingSeconds: person.id === 'alice' ? 8 : 4, budgetSeconds: 120, attempts: 1, timeUp: false })), activeId: null, previousId: 'alice', remaining: 120, turnTotal: 120, running: false, turnStarted: false, focusMode: false, managing: false, ended: false, warned: false, deadline: 0 });

test('explicit finish excludes postponed people, including partial attempts, without mutating attendance', () => {
  const original = waiting();
  const finished = finishWaitingRound(original)!;
  assert.ok(finished.people.every(person => person.done));
  assert.equal(original.people[1].done, false);
  assert.equal(finished.people[1].present, true);
  assert.equal(finished.people[1].speakingSeconds, 4);
  const archived = completedRound('round-skipped', roundSpeakers(finished.people));
  assert.deepEqual(archived.people.map(person => person.id), ['alice']);
  assert.equal(archived.people[0].speakingSeconds, 8);
  assert.equal(finishWaitingRound(finished), null, 'repeated finish cannot archive twice');
});

test('finish is blocked during a turn, with available speakers, or without a completed passage', () => {
  assert.equal(finishWaitingRound({ ...waiting(), activeId: 'alice' }), null);
  assert.equal(finishWaitingRound({ ...waiting(), running: true }), null);
  const unfinished = waiting();
  unfinished.people[0].done = false;
  assert.equal(finishWaitingRound(unfinished), null);
  unfinished.people[0].postponed = true;
  assert.equal(finishWaitingRound(unfinished), null);
});

test('waiting choice and explicit exclusions survive refresh with stable archive identity', () => {
  const now = new Date();
  const checkpoint = { version: 1, day: checkpointDay(now), context: checkpointContext(team), session: team.session, postponed: team.postponed, timer: waiting(), roundId: null as string | null };
  assert.equal(parseCheckpoint(JSON.stringify(checkpoint), team, now)?.timer.people[1].done, false);
  checkpoint.timer = finishWaitingRound(checkpoint.timer)!;
  checkpoint.roundId = 'round-skipped';
  const restored = parseCheckpoint(JSON.stringify(checkpoint), team, now)!;
  assert.equal(restored.roundId, 'round-skipped');
  assert.ok(restored.timer.people.every(person => person.done));
  assert.deepEqual(roundSpeakers(restored.timer.people).map(person => person.id), ['alice']);
});

test('late mood rebases checkpoint context without losing finished turns or postponed partial time', () => {
  const now = new Date();
  const saved = { version: 1 as const, day: checkpointDay(now), context: checkpointContext(team), session: team.session, postponed: team.postponed!, timer: waiting(), roundId: 'same-round' };
  const slide = { meterId: 'same-meter', title: 'Same meter', image: 'mood-meters/slides/test/page.svg', slideNumber: 2 };
  const resumed = rejoinCheckpoint(saved, { ...team, currentMoodSlide: slide }, 'bob', 4)!;
  assert.equal(resumed.timer.activeId, 'bob');
  assert.equal(resumed.timer.running, false);
  assert.deepEqual(resumed.timer.people[0], saved.timer.people[0]);
  assert.equal(resumed.timer.people[1].speakingSeconds, 4);
  assert.deepEqual(resumed.team.session, team.session);
  assert.deepEqual(resumed.team.postponed, []);
  assert.deepEqual(resumed.team.roster[1].moodSlide, slide);
  const rewritten = { ...saved, timer: resumed.timer, postponed: resumed.team.postponed, context: checkpointContext(resumed.team) };
  assert.equal(parseCheckpoint(JSON.stringify(rewritten), resumed.team, now)?.roundId, 'same-round');
  assert.equal(rejoinCheckpoint(saved, team, 'alice', 2), null);
});