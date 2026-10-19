import test from 'node:test';
import assert from 'node:assert/strict';
import { freshRound, toggleAttendance } from '../src/lib/attendance.ts';
import { canStartSession } from '../src/lib/team-storage.ts';
import { invalidatesCheckpoint } from '../src/lib/timer-checkpoint.ts';
import type { TeamState } from '../src/types/team.ts';

const team: TeamState = {
  roster: [
    { id: 'alice', name: 'Alice', present: true, mood: 2, moodUpdatedAt: '2026-10-19T09:00:00Z' },
    { id: 'bob', name: 'Bob', present: true, mood: null, moodUpdatedAt: null },
    { id: 'carol', name: 'Carol', present: false, mood: null, moodUpdatedAt: null },
  ], session: ['alice', 'bob'], postponed: ['bob'], duration: 120, warning: 30, sound: false,
  usedMoodMeters: ['original'], currentMoodSlide: { title: 'Original', image: '/mood-meters/slides/test/page.svg', slideNumber: 1 },
};

test('fresh round clears moods, slide, postponements and lineup without changing team identity or preferences', () => {
  const next = freshRound(team);
  assert.deepEqual(next.session, []);
  assert.deepEqual(next.postponed, []);
  assert.equal(next.currentMoodSlide, null);
  assert.deepEqual(next.roster.map(p => p.id), team.roster.map(p => p.id));
  assert.ok(next.roster.every(p => p.present && p.mood === null && p.moodUpdatedAt === null && p.moodSlide === null));
  assert.equal(next.duration, team.duration);
  assert.deepEqual(next.usedMoodMeters, team.usedMoodMeters);
  const onlyAliceVoted = { ...next, roster: next.roster.map(p => p.id === 'alice' ? { ...p, mood: 2 as const } : p) };
  assert.equal(canStartSession(onlyAliceVoted), false);
  assert.deepEqual(team.postponed, ['bob']);
});

test('attendance re-entry clears only the moved participant postponement and invalidates session', () => {
  const absent = toggleAttendance(team, 'bob');
  assert.deepEqual(absent.postponed, []);
  assert.deepEqual(absent.session, []);
  const present = toggleAttendance(absent, 'bob');
  assert.equal(present.roster[1].present, true);
  assert.equal(present.roster[1].mood, null);
  assert.equal(canStartSession(present), false);
  assert.equal(present.roster[0], team.roster[0]);
  assert.equal(toggleAttendance(team, 'missing'), team);
  assert.deepEqual(toggleAttendance({ ...team, postponed: ['alice', 'bob'] }, 'bob').postponed, ['alice']);
});

test('checkpoints invalidate on reset, attendance, mood and settings edits, not sound or session preparation', () => {
  assert.equal(invalidatesCheckpoint(team, freshRound(team)), true);
  assert.equal(invalidatesCheckpoint(team, toggleAttendance(team, 'bob')), true);
  assert.equal(invalidatesCheckpoint(team, { ...team, session: [] }), true);
  assert.equal(invalidatesCheckpoint(team, { ...team, duration: 60 }), true);
  assert.equal(invalidatesCheckpoint(team, { ...team, roster: team.roster.map(p => ({ ...p, mood: 4 })) }), true);
  assert.equal(invalidatesCheckpoint(team, { ...team, sound: true }), false);
  assert.equal(invalidatesCheckpoint({ ...team, session: [] }, team), false);
});