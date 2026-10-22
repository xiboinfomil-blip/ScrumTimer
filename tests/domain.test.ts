import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTeam, canStartSession, hasValidSession } from '../src/lib/team-storage.ts';
import { shuffle } from '../src/lib/shuffle.ts';
import { secondsUntil, timerFrame, formatTime, shuffleEligible, timerUrgency } from '../src/lib/timer.ts';
import { parseMoodMeterCatalog } from '../src/lib/mood-meter.ts';
import { timeScore, scoreSpeaker, speakerScoreProgress, explainScore, sessionLeaderboard, sessionStatistics, type SessionSpeaker } from '../src/lib/session-results.ts';
import { validateTeamInput } from '../src/lib/team-validation.ts';

test('explicit postponement permits ready teammates without treating waiting members as absent or persisting progress', () => {
  const team = normalizeTeam({ roster: [{ id: 'a', name: 'Alice', mood: 1 }, { id: 'b', name: 'Bob', mood: null }], session: ['a', 'b'], postponed: ['b'] });
  assert.equal(canStartSession(team), true);
  assert.equal(hasValidSession(team), true);
  assert.equal(team.roster[1].present, true);
  assert.equal(canStartSession({ ...team, postponed: [] }), false);
  assert.equal(canStartSession({ ...team, postponed: ['a', 'b'] }), false);
  assert.equal(hasValidSession({ ...team, session: ['a'] }), false);
  assert.equal(validateTeamInput(team).postponed, undefined);
  assert.deepEqual(validateTeamInput(team).session, []);
  assert.throws(() => validateTeamInput({ ...team, postponed: ['unknown'] }));
  assert.throws(() => validateTeamInput({ ...team, postponed: ['b', 'b'] }));
});

test('remote SVG catalogue keeps lazy decks and validates safe slide references', () => {
  const id = 'deck-1234567890abcdef1234';
  const [lazy] = parseMoodMeterCatalog([{ remoteId: id, title: 'Public deck', slides: [] }]);
  assert.equal(lazy.remoteId, id);
  assert.deepEqual(lazy.slides, []);
  assert.deepEqual(parseMoodMeterCatalog([{ remoteId: '../escape', title: 'Unsafe', slides: [] }]), []);
  const image = `mood-meters/slides/${id}/slide_1.svg`;
  assert.equal(parseMoodMeterCatalog([{ title: 'SVG', slides: [image] }])[0].slides[0].image, `/${image}`);
  assert.equal(parseMoodMeterCatalog([{ title: 'Unsafe', slides: ['https://evil.example/x.svg'] }]).length, 0);
  const state = normalizeTeam({ roster: [{ id: 'a', name: 'Alice', mood: 1, moodSlide: { title: 'SVG', image: `/${image}`, slideNumber: 1 } }] });
  assert.equal(state.roster[0].moodSlide?.image, `/${image}`);
});

test('leaderboard scores time fairly, excludes unmeasured turns and shares ties independently of mood', () => {
  const person: SessionSpeaker = { id: 'a', name: 'Alice', present: true, mood: 1, moodUpdatedAt: null, done: true, started: true, speakingSeconds: 50, budgetSeconds: 120, timeUp: false, attempts: 1 };
  assert.equal(scoreSpeaker(person), 450);
  assert.equal(scoreSpeaker({ ...person, mood: 4 }), 450);
  assert.equal(scoreSpeaker({ ...person, speakingSeconds: 110 }), 975);
  assert.equal(scoreSpeaker({ ...person, speakingSeconds: 3 }), 0);
  assert.equal(scoreSpeaker({ ...person, attempts: 2 }), 350);
  assert.equal(scoreSpeaker({ ...person, attempts: 9 }), 250);
  assert.equal(scoreSpeaker({ ...person, started: false }), null);
  assert.equal(scoreSpeaker({ ...person, speakingSeconds: 0.1 }), null);
  assert.equal(scoreSpeaker({ ...person, timeUp: true, speakingSeconds: 120 }), 850);
  assert.equal(scoreSpeaker({ ...person, timeUp: true, speakingSeconds: 120.000000001 }), 850);
  assert.equal(scoreSpeaker({ ...person, timeUp: true, speakingSeconds: 240 }), 250);
  const people = [person, { ...person, id: 'b', mood: 4 as const }, { ...person, id: 'c', timeUp: true, speakingSeconds: 132 }];
  assert.deepEqual(sessionLeaderboard(people).map(p => p.rank), [1, 2, 2]);
  const stats = sessionStatistics(people);
  assert.equal(stats.speakingSeconds, 232);
  assert.equal(stats.withinTime, 2);
  assert.equal(stats.moods[3].count, 1);
});

test('normalizes legacy roster and rejects invalid preferences and moods', () => {
  const state = normalizeTeam({ people: [{ id: 'a', name: ' Alice ', mood: 9 }, { id: 'a', name: '<b>Bob</b>', mood: 3 }, { name: ' ' }], duration: -1, warning: 5 });
  assert.equal(state.roster.length, 2);
  assert.equal(state.roster[0].name, 'Alice');
  assert.equal(state.roster[0].mood, null);
  assert.notEqual(state.roster[0].id, state.roster[1].id);
  assert.equal(state.roster[1].name, '<b>Bob</b>');
  assert.equal(state.duration, 120);
  assert.equal(state.warning, 30);
});

test('session requires every present teammate and excludes absentees', () => {
  const state = normalizeTeam({ roster: [{ id: 'a', name: 'Alice', mood: 1 }, { id: 'b', name: 'Bob', present: false, mood: 2 }], session: ['a', 'b', 'a', 'unknown'] });
  assert.deepEqual(state.session, ['a']);
  assert.equal(canStartSession(state), true);
  assert.equal(hasValidSession(state), true);
  state.roster.push({ id: 'c', name: 'Charlie', present: true, mood: null, moodUpdatedAt: null });
  assert.equal(canStartSession(state), false);
  assert.equal(hasValidSession(state), false);
});

test('normalizes database team payloads without a browser storage adapter', () => {
  const state = normalizeTeam({ roster: [{ name: 'Alice' }], duration: 90 });
  assert.equal(state.duration, 90);
  assert.equal(state.roster[0].name, 'Alice');
});

test('shuffle guarantees a changed order even with a fixed random source', () => {
  const random = Math.random;
  Math.random = () => 0.999;
  try { assert.notDeepEqual(shuffle(['a', 'b'], true), ['a', 'b']); }
  finally { Math.random = random; }
  assert.deepEqual(shuffle(['a'], true), ['a']);
});

test('speaker shuffle locks a started turn even while paused', () => {
  const people = [{ id: 'a', done: false }, { id: 'b', done: true }, { id: 'c', done: false }];
  assert.deepEqual(shuffleEligible(people, 'a', false).map(p => p.id), ['a', 'c']);
  assert.deepEqual(shuffleEligible(people, 'a', true).map(p => p.id), ['c']);
});

test('countdown is based on a deadline and never becomes negative', () => {
  assert.equal(secondsUntil(10000, 3500), 6.5);
  assert.equal(secondsUntil(10000, 11000), 0);
  assert.equal(formatTime(61.1), '01:02');
});

test('catalog rejects remote, traversal, and non-image slide paths', () => {
  const catalog = parseMoodMeterCatalog([
    { title: 'Safe', slides: ['mood-meters/slides/deck/slide.png'] },
    { title: 'Remote', slides: ['https://example.com/slide.png'] },
    { title: 'Traversal', slides: ['mood-meters/slides/../private.png'] },
    { title: 'Sources', slides: ['mood-meters/powerpoints/source.pptx'] },
  ]);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].slides[0].image, '/mood-meters/slides/deck/slide.png');
});

test('timer warning progresses to critical only during a started turn and respects disabled warnings', () => {
  assert.equal(timerUrgency(30, 30, false, false), 'normal');
  assert.equal(timerUrgency(31, 30, false, true), 'normal');
  assert.equal(timerUrgency(30, 30, false, true), 'warning');
  assert.equal(timerUrgency(10, 30, false, true), 'critical');
  assert.equal(timerUrgency(6, 10, false, true), 'warning');
  assert.equal(timerUrgency(5, 10, false, true), 'critical');
  assert.equal(timerUrgency(3, 0, false, true), 'normal');
  assert.equal(timerUrgency(0, 0, true, true), 'expired');
});

test('mood slide context preserves safe local references and rejects remote and traversal images', () => {
  const context = { title: 'Alligators', image: '/mood-meters/slides/deck/slide.png', slideNumber: 1 };
  const state = normalizeTeam({ currentMoodSlide: context, roster: [{ name: 'Alice', mood: 2, moodSlide: context }] });
  assert.deepEqual(state.roster[0].moodSlide, context);
  assert.deepEqual(state.currentMoodSlide, context);
  assert.equal(normalizeTeam({ currentMoodSlide: { ...context, image: 'https://example.com/a.png' } }).currentMoodSlide, null);
  assert.equal(normalizeTeam({ currentMoodSlide: { ...context, image: '/mood-meters/slides/../a.png' } }).currentMoodSlide, null);
});

test('fixed two-minute scoring uses grace, floor, peak, three closing bands and completed overtime steps', () => {
  const person: SessionSpeaker = { id: 'a', name: 'Alice', present: true, mood: 1, moodUpdatedAt: null, done: false, started: true, speakingSeconds: 0, budgetSeconds: 120, timeUp: false, attempts: 1 };
  for (const [seconds, expected, zone] of [[0, 0, 'building'], [5, 0, 'building'], [5.001, 125, 'building'], [15, 125, 'building'], [17.5, 125, 'building'], [30, 250, 'building'], [60, 550, 'optimal'], [72, 670, 'optimal'], [100, 950, 'optimal'], [105, 1000, 'optimal'], [107.5, 988, 'closing'], [110, 975, 'closing'], [112.5, 950, 'closing'], [115, 925, 'closing'], [117.5, 888, 'closing'], [120, 850, 'closing'], [120.1, 850, 'overtime'], [129.999, 850, 'overtime'], [130, 800, 'overtime'], [140, 750, 'overtime'], [144, 750, 'overtime'], [260, 150, 'overtime'], [270, 125, 'overtime'], [1000, 125, 'overtime']] as const) {
    const active = { ...person, speakingSeconds: seconds };
    assert.deepEqual(speakerScoreProgress(active), { score: expected, zone });
    assert.equal(scoreSpeaker(active), null);
    assert.equal(scoreSpeaker({ ...active, done: true }), seconds < 1 ? null : expected);
  }
  assert.deepEqual(speakerScoreProgress({ ...person, started: false }), { score: null, zone: 'waiting' });
  assert.equal(speakerScoreProgress({ ...person, budgetSeconds: 0 }).score, null);
  assert.equal(speakerScoreProgress({ ...person, speakingSeconds: Infinity }).score, null);
  assert.equal(scoreSpeaker({ ...person, done: true, speakingSeconds: 120, attempts: 2 }), 750);
  assert.equal(scoreSpeaker({ ...person, done: true, speakingSeconds: 240, attempts: 5 }), 125);
  assert.equal(scoreSpeaker({ ...person, done: true, speakingSeconds: 5, attempts: 5 }), 0);
  assert.equal(scoreSpeaker({ ...person, done: true, speakingSeconds: 6, attempts: 5 }), 125);
});

test('closing boundaries are continuous and the fixed scoring timeline does not scale with timer budgets', () => {
  for (const [seconds, points] of [[105, 1000], [110, 975], [115, 925], [120, 850]]) {
    assert.equal(timeScore(seconds - .001, 120).points, points);
    assert.equal(timeScore(seconds, 120).points, points);
    assert.equal(timeScore(seconds + .001, 120).points, points);
  }
  let previous = 1000;
  for (let seconds = 105; seconds <= 300; seconds += .25) {
    const { points } = timeScore(seconds, 120);
    assert.ok(Number.isInteger(points) && points >= 125 && points <= 1000);
    assert.ok(points <= previous);
    assert.equal(timeScore(seconds, 60).points, points);
    assert.equal(timeScore(seconds, 180).points, points);
    previous = points;
  }
});

test('optimal-zone durations differentiate rankings while identical inputs retain shared ranks and retry penalties', () => {
  const person: SessionSpeaker = { id: 'a', name: 'Alice', present: true, mood: 1, moodUpdatedAt: null, done: true, started: true, speakingSeconds: 72, budgetSeconds: 120, timeUp: false, attempts: 1 };
  const ranked = sessionLeaderboard([person, { ...person, id: 'b', speakingSeconds: 90 }, { ...person, id: 'c', speakingSeconds: 102 }, { ...person, id: 'd' }]);
  assert.deepEqual(ranked.map(({ id, score, rank }) => ({ id, score, rank })), [
    { id: 'c', score: 970, rank: 1 }, { id: 'b', score: 850, rank: 2 },
    { id: 'a', score: 670, rank: 3 }, { id: 'd', score: 670, rank: 3 },
  ]);
  assert.equal(scoreSpeaker({ ...person, attempts: 2 }), 570);
  assert.equal(scoreSpeaker({ ...person, attempts: 9 }), 470);
});

test('signed deadline frames measure overtime and pauses without interval-count drift', () => {
  assert.deepEqual(timerFrame(10000, 3500, 10), { remaining: 6.5, elapsed: 3.5 });
  assert.deepEqual(timerFrame(10000, 10000, 6.5), { remaining: 0, elapsed: 6.5 });
  assert.deepEqual(timerFrame(10000, 12500, 0), { remaining: -2.5, elapsed: 2.5 });
  assert.deepEqual(timerFrame(10000, 20000, 10), { remaining: -10, elapsed: 20 });
  // Resume with a new deadline after a long pause; only active time accrues.
  assert.deepEqual(timerFrame(97500, 101000, -2.5), { remaining: -3.5, elapsed: 1 });
  assert.deepEqual(timerFrame(10000, 3000, 6.5), { remaining: 6.5, elapsed: 0 });
});

test('individual score explanations show arithmetic and never invent archived retry counts', () => {
  assert.match(explainScore({ speakingSeconds: 30, budgetSeconds: 120, score: 250, attempts: 1 }).join(' '), /250 pts après arrondi/);
  const optimal = explainScore({ speakingSeconds: 105, budgetSeconds: 120, score: 800, attempts: 3 }).join(' ');
  assert.match(optimal, /Pic de 1 000 pts à 105 s/);
  assert.match(optimal, /pénalité de 200 pts/);
  assert.match(optimal, /max\(125, 1000 − 200\) = 800 pts/);
  const overtime = explainScore({ speakingSeconds: 144, budgetSeconds: 120, score: 750, attempts: 1 }).join(' ');
  assert.match(overtime, /max\(125, 850 − 50 × 2\) = 750 pts/);
  assert.match(explainScore({ speakingSeconds: 5, budgetSeconds: 120, score: 0, attempts: 1 }).join(' '), /5 premières secondes : 0 pt/);
  assert.match(explainScore({ speakingSeconds: 108, budgetSeconds: 120, score: 985, attempts: 1 }).join(' '), /985 pts après arrondi/);
  const archive = explainScore({ speakingSeconds: 60, budgetSeconds: 120, score: 867 }).join(' ');
  assert.match(archive, /Score enregistré : 867 pts/);
  assert.match(archive, /317 pts/);
  assert.match(archive, /ne peut donc pas être attribué avec certitude/);
  const oldPlateau = explainScore({ speakingSeconds: 102, budgetSeconds: 120, score: 1000 }).join(' ');
  assert.match(oldPlateau, /Score enregistré : 1000 pts/);
  assert.match(oldPlateau, /Écart avec le score de temps actuel : 30 pts/);
  assert.match(oldPlateau, /Le score enregistré n’est pas recalculé/);
  assert.match(explainScore({ speakingSeconds: 0, budgetSeconds: 120, score: null })[0], /aucun score attribué/);
});