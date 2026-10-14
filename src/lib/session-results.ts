import type { Person } from '../types/team.ts';

export type SessionSpeaker = Person & { done: boolean; started: boolean; speakingSeconds: number; budgetSeconds: number; timeUp: boolean; attempts: number };

// Mood never affects the score. A balanced turn earns more than an instant skip.
export function scoreSpeaker(person: SessionSpeaker): number | null {
  if (!person.done || !person.started || person.speakingSeconds < 1 || person.budgetSeconds <= 0) return null;
  const extra = Math.max(0, Math.round((person.speakingSeconds - person.budgetSeconds) * 1000) / 1000);
  const penalty = Math.min(300, Math.ceil(extra / person.budgetSeconds * 300));
  const ratio = person.speakingSeconds / person.budgetSeconds;
  const balance = Math.round(300 * (ratio < .25 ? ratio / .25 : ratio <= .85 ? 1 : ratio < 1 ? (1 - ratio) / .15 : 0));
  const retries = Math.min(200, Math.max(0, person.attempts - 1) * 100);
  return Math.max(0, 400 + (person.timeUp ? 0 : 300) + balance - penalty - retries);
}

export function sessionLeaderboard(people: SessionSpeaker[]) {
  const sorted = people.map(person => ({ ...person, score: scoreSpeaker(person) }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return sorted.map((person, index) => ({ ...person, rank: person.score === null ? null : sorted.findIndex(other => other.score === person.score) + 1, position: index + 1 }));
}

export function sessionStatistics(people: SessionSpeaker[]) {
  const measured = people.filter(person => person.done && person.started && person.speakingSeconds >= 1);
  const speakingSeconds = people.reduce((sum, person) => sum + person.speakingSeconds, 0);
  return {
    speakingSeconds,
    averageSeconds: measured.length ? speakingSeconds / measured.length : 0,
    measured: measured.length,
    withinTime: measured.filter(person => !person.timeUp && person.speakingSeconds <= person.budgetSeconds).length,
    expired: people.filter(person => person.timeUp).length,
    moods: ([1, 2, 3, 4] as const).map(mood => ({ mood, count: people.filter(person => person.mood === mood).length })),
  };
}