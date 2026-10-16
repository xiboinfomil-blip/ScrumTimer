import assert from 'node:assert/strict';
import test from 'node:test';
import { completedRound, dailyRoundStatistics, historyCutoff, historyLeaderboard, normalizeHistory, summarizeDays, type HistoryRound } from '../src/lib/history.ts';
import { chooseUnusedDeck, moodMeterId, type MoodMeterDeck } from '../src/lib/mood-meter.ts';
import { normalizeTeam } from '../src/lib/team-storage.ts';
import { groupDailyMoods } from '../src/lib/daily-moods.ts';

const now = new Date('2026-10-14T12:00:00Z');
const round: HistoryRound = { id: 'round-1', completedAt: '2026-10-14T10:00:00Z', people: [{ id: 'alice', name: 'Alice', mood: 2, speakingSeconds: 30, budgetSeconds: 120, timeUp: false, score: 1000, meterTitle: 'Alligators' }] };
test('daily moods group exact saved slide choices without guessing missing or changed check-ins', () => {
  const slide = { title: 'Alligators', image: '/mood-meters/slides/test/1.svg', slideNumber: 1 };
  const roster = normalizeTeam({ roster: [{ id: 'alice', name: 'Alice', mood: 2, moodUpdatedAt: '2026-10-14T09:00:00Z', moodSlide: slide }] }).roster;
  const groups = groupDailyMoods(round, roster);
  assert.equal(groups[0].context?.image, slide.image);
  assert.deepEqual(groups[0].choices.map(choice => choice.mood), [1, 4, 2, 3]);
  assert.equal(groups[0].choices[2].people[0].name, 'Alice');
  assert.equal(groupDailyMoods(round, [])[0].context, null);
  assert.equal(groupDailyMoods(round, [{ ...roster[0], mood: 3 }])[0].context, null);
  assert.equal(groupDailyMoods(round, [{ ...roster[0], moodUpdatedAt: '2026-10-14T11:00:00Z' }])[0].context, null);
  const mixed = { ...round, people: [...round.people, { ...round.people[0], id: 'bob', name: 'Bob', meterTitle: 'Other' }] };
  assert.equal(groupDailyMoods(mixed, roster).length, 2);
});
test('daily dashboard uses recorded scores, shared ranks and measured time categories', () => {
  const people = [
    { ...round.people[0], id: 'a', name: 'Alice', speakingSeconds: 30 },
    { ...round.people[0], id: 'b', name: 'Bob', speakingSeconds: 120, timeUp: true },
    { ...round.people[0], id: 'c', name: 'Charlie', speakingSeconds: 15, score: 500 },
    { ...round.people[0], id: 'd', name: 'Dana', speakingSeconds: 144, score: 800 },
    { ...round.people[0], id: 'e', name: 'Eve', speakingSeconds: 0, budgetSeconds: 0, score: null, mood: null },
  ];
  const stats = dailyRoundStatistics({ ...round, people });
  assert.equal(stats.averageScore, 825);
  assert.equal(stats.bestScore, 1000);
  assert.equal(stats.seconds, 309);
  assert.equal(stats.averageSeconds, 77.25);
  assert.equal(stats.withinTime, 3);
  assert.equal(stats.optimal, 0);
  assert.equal(stats.short, 2);
  assert.equal(stats.closing, 1);
  assert.equal(stats.overtime, 1);
  assert.equal(stats.overtimeSeconds, 24);
  assert.equal(stats.unmeasured, 1);
  assert.equal(stats.missingMoods, 1);
  assert.deepEqual(stats.ranked.map(person => person.rank), [1, 1, 3, 4, null]);
  const empty = dailyRoundStatistics({ ...round, people: [people[4]] });
  assert.equal(empty.averageScore, null);
  assert.equal(empty.averageSeconds, null);
  assert.equal(empty.optimal, 0);
  assert.equal(empty.closing, 0);
  const legacy = dailyRoundStatistics({ ...round, people: [{ ...people[0], score: 867 }] });
  assert.equal(legacy.averageScore, 867, 'never recalculate an archived score');
});
test('daily dashboard time zones include 50 and 85 percent in optimal and 100 percent in closing', () => {
  for (const [speakingSeconds, zone] of [
    [0, 'unmeasured'], [.5, 'unmeasured'], [1, 'short'], [59.9, 'short'],
    [60, 'optimal'], [102, 'optimal'], [102.1, 'closing'], [120, 'closing'], [120.1, 'overtime'],
  ] as const) {
    const stats = dailyRoundStatistics({ ...round, people: [{ ...round.people[0], speakingSeconds }] });
    for (const key of ['short', 'optimal', 'closing', 'overtime', 'unmeasured'] as const) {
      assert.equal(stats[key], key === zone ? 1 : 0, `${speakingSeconds}s: ${key}`);
    }
    assert.equal(stats.withinTime, speakingSeconds >= 1 && speakingSeconds <= 120 ? 1 : 0);
    assert.equal(stats.short + stats.optimal + stats.closing, stats.withinTime);
    assert.equal(stats.short + stats.optimal + stats.closing + stats.overtime, stats.measured);
    assert.equal(stats.ranked[0].score, 1000, 'time zones never change archived scores');
  }
});
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
  assert.equal(result.people[0].score, 500);
  assert.equal(result.people[0].meterTitle, 'Used deck');
  assert.equal(normalizeHistory([result]).length, 1);
});
test('exactly the full time budget remains on time across historical summaries', () => {
  const exact = { ...round, people: [{ ...round.people[0], speakingSeconds: 120, timeUp: true }] };
  assert.equal(summarizeDays([exact], now)[4].withinTime, 1);
  assert.equal(historyLeaderboard([exact], now)[0].withinTime, 1);
  const overtime = { ...round, people: [{ ...round.people[0], speakingSeconds: 120.1, timeUp: true }] };
  assert.equal(summarizeDays([overtime], now)[4].withinTime, 0);
  assert.equal(historyLeaderboard([overtime], now)[0].withinTime, 0);
});
test('automatic meter selection never reuses a used deck but manual ids remain available', () => {
  const decks: MoodMeterDeck[] = [{ title: 'A', remoteId: 'a', slides: [] }, { title: 'B', remoteId: 'b', slides: [] }];
  assert.equal(chooseUnusedDeck(decks, ['a']), 1);
  assert.equal(chooseUnusedDeck(decks, ['a', 'b']), -1);
  assert.equal(chooseUnusedDeck(decks, [], 0), 1);
  assert.equal(moodMeterId(decks[0]), 'a');
  assert.deepEqual(normalizeTeam({ usedMoodMeters: ['a', 'a', 5, ''] }).usedMoodMeters, ['a']);
});