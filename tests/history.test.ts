import assert from 'node:assert/strict';
import test from 'node:test';
import { completedRound, historyCutoff, historyLeaderboard, normalizeHistory, summarizeDays, type HistoryRound } from '../src/lib/history.ts';
import { chooseUnusedDeck, moodMeterId, type MoodMeterDeck } from '../src/lib/mood-meter.ts';
import { normalizeTeam } from '../src/lib/team-storage.ts';

const now = new Date('2026-10-14T12:00:00Z');
const round: HistoryRound = { id: 'round-1', completedAt: '2026-10-14T10:00:00Z', people: [{ id: 'alice', name: 'Alice', mood: 2, speakingSeconds: 30, budgetSeconds: 120, timeUp: false, score: 1000, meterTitle: 'Alligators' }] };
test('historical leaderboard averages measured scores, shares ties and keeps participant identities', () => {
  const second: HistoryRound = { id: 'round-2', completedAt: '2026-10-14T11:00:00Z', people: [
    { ...round.people[0], name: 'Alice renamed', score: 800 },
    { ...round.people[0], id: 'bob', name: 'Bob', score: 900, mood: 4 },
    { ...round.people[0], id: 'skip', name: 'Skipped', speakingSeconds: 0, budgetSeconds: 0, score: null },
    { ...round.people[0], id: 'other-alice', name: 'Alice', score: 700 },
  ] };
  const rows = historyLeaderboard([round, second, second], now);
  assert.deepEqual(rows.map(p => [p.id, p.rank, p.averageScore]), [['alice', 1, 900], ['bob', 1, 900], ['other-alice', 3, 700], ['skip', null, null]]);
  assert.equal(rows[0].name, 'Alice renamed');
  assert.equal(rows[0].scored, 2);
  assert.equal(rows[0].averageSeconds, 30);
  assert.equal(rows[3].turns, 1);
  assert.equal(historyLeaderboard([{ ...round, completedAt: '2026-09-01T00:00:00Z' }], now).length, 0);
});
test('history retains exactly five UTC calendar days including today and excludes future and duplicate results', () => {
  assert.equal(historyCutoff(now).toISOString(), '2026-10-10T00:00:00.000Z');
  const oldest = { ...round, id: 'oldest', completedAt: '2026-10-10T00:00:00Z' };
  const expired = { ...round, id: 'expired', completedAt: '2026-10-09T23:59:59.999Z' };
  const future = { ...round, id: 'future', completedAt: '2026-10-14T12:01:00Z' };
  assert.deepEqual(normalizeHistory([round, round, oldest, expired, future, null], now).map(r => r.id), ['round-1', 'oldest']);
});
test('history rejects malformed or unbounded participant metrics and sanitizes text', () => {
  assert.deepEqual(normalizeHistory([{ ...round, people: [{ ...round.people[0], speakingSeconds: Infinity }] }], now), []);
  assert.deepEqual(normalizeHistory([{ ...round, people: [round.people[0], round.people[0]] }], now), []);
  assert.deepEqual(normalizeHistory([{ ...round, id: '../bad' }], now), []);
  assert.equal(normalizeHistory([{ ...round, people: [{ ...round.people[0], name: ' X '.repeat(100) }] }], now)[0].people[0].name.length, 60);
});
test('daily summary fills empty days and does not call unmeasured skips on time', () => {
  const skipped = { ...round, id: 'skip', people: [{ ...round.people[0], speakingSeconds: 0, budgetSeconds: 0 }] };
  const days = summarizeDays([round, skipped], now);
  assert.equal(days.length, 5);
  assert.equal(days[0].date, '2026-10-10');
  assert.equal(days[0].rounds, 0);
  assert.deepEqual(days[4], { date: '2026-10-14', rounds: 2, participants: 2, seconds: 30, withinTime: 1, moods: [0, 2, 0, 0] });
});
test('round snapshot retains stable id, meter label and calculated score', () => {
  const result = completedRound('stable-round', [{ id: 'a', name: '<b>Alice</b>', mood: 1, present: true, moodUpdatedAt: null, moodSlide: { title: 'Used deck', image: '/mood-meters/slides/deck/1.svg', slideNumber: 1 }, done: true, started: true, speakingSeconds: 30, budgetSeconds: 120, timeUp: false, attempts: 1 }]);
  assert.equal(result.id, 'stable-round');
  assert.equal(result.people[0].score, 1000);
  assert.equal(result.people[0].meterTitle, 'Used deck');
  assert.equal(normalizeHistory([result]).length, 1);
});
test('automatic meter selection never reuses a used deck but manual ids remain available', () => {
  const decks: MoodMeterDeck[] = [{ title: 'A', remoteId: 'a', slides: [] }, { title: 'B', remoteId: 'b', slides: [] }];
  assert.equal(chooseUnusedDeck(decks, ['a']), 1);
  assert.equal(chooseUnusedDeck(decks, ['a', 'b']), -1);
  assert.equal(chooseUnusedDeck(decks, [], 0), 1);
  assert.equal(moodMeterId(decks[0]), 'a');
  assert.deepEqual(normalizeTeam({ usedMoodMeters: ['a', 'a', 5, ''] }).usedMoodMeters, ['a']);
});