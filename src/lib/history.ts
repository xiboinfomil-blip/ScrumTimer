import type { Mood } from '../types/team.ts';
import { scoreSpeaker, type SessionSpeaker } from './session-results.ts';

export interface HistoryPerson {
  id: string; name: string; mood: Mood | null; speakingSeconds: number;
  budgetSeconds: number; timeUp: boolean; score: number | null; meterTitle: string | null;
}
export interface HistoryRound { id: string; completedAt: string; people: HistoryPerson[] }
export function historyCutoff(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - 9);
  return cutoff;
}
export function normalizeHistory(value: unknown, now = new Date()): HistoryRound[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((round): HistoryRound[] => {
    if (!round || typeof round !== 'object' || typeof round.id !== 'string' || !/^[\w-]{1,100}$/.test(round.id) || seen.has(round.id) || typeof round.completedAt !== 'string') return [];
    const date = new Date(round.completedAt);
    if (!Number.isFinite(date.getTime()) || date < historyCutoff(now) || date > now || !Array.isArray(round.people) || !round.people.length || round.people.length > 100) return [];
    const people: HistoryPerson[] = [];
    const ids = new Set<string>();
    for (const p of round.people) {
      if (!p || typeof p.id !== 'string' || p.id.length > 100 || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || typeof p.speakingSeconds !== 'number' || !Number.isFinite(p.speakingSeconds) || p.speakingSeconds < 0 || p.speakingSeconds > 86400 || typeof p.budgetSeconds !== 'number' || !Number.isFinite(p.budgetSeconds) || p.budgetSeconds < 0 || p.budgetSeconds > 86400 || typeof p.timeUp !== 'boolean') return [];
      ids.add(p.id);
      people.push({ id: p.id, name: p.name.trim().slice(0, 60), mood: [1,2,3,4].includes(p.mood) ? p.mood : null, speakingSeconds: p.speakingSeconds, budgetSeconds: p.budgetSeconds, timeUp: p.timeUp, score: typeof p.score === 'number' && Number.isFinite(p.score) ? Math.max(0, Math.min(1000, Math.round(p.score))) : null, meterTitle: typeof p.meterTitle === 'string' ? p.meterTitle.slice(0, 200) : null });
    }
    seen.add(round.id);
    return [{ id: round.id, completedAt: date.toISOString(), people }];
  }).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}
export function completedRound(id: string, people: SessionSpeaker[]): HistoryRound {
  return { id, completedAt: new Date().toISOString(), people: people.map(p => ({ id: p.id, name: p.name, mood: p.mood, speakingSeconds: p.speakingSeconds, budgetSeconds: p.budgetSeconds, timeUp: p.timeUp, score: scoreSpeaker(p), meterTitle: p.moodSlide?.title ?? null })) };
}
export function summarizeDays(value: HistoryRound[], now = new Date()) {
  const rounds = normalizeHistory(value, now);
  return Array.from({ length: 10 }, (_, index) => {
    const date = historyCutoff(now); date.setUTCDate(date.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    const selected = rounds.filter(round => round.completedAt.slice(0, 10) === key);
    const people = selected.flatMap(round => round.people);
    return { date: key, rounds: selected.length, participants: people.length, seconds: people.reduce((sum, p) => sum + p.speakingSeconds, 0), withinTime: people.filter(p => p.budgetSeconds > 0 && p.speakingSeconds >= 1 && !p.timeUp && p.speakingSeconds <= p.budgetSeconds).length, moods: [1,2,3,4].map(mood => people.filter(p => p.mood === mood).length) };
  });
}

export function historyLeaderboard(value: HistoryRound[], now = new Date()) {
  const participants = new Map<string, { id: string; name: string; turns: number; scored: number; totalScore: number; seconds: number; withinTime: number }>();
  // Normalization sorts newest first, so renamed participants use their latest name.
  for (const round of normalizeHistory(value, now)) {
    for (const person of round.people) {
      const row = participants.get(person.id) ?? { id: person.id, name: person.name, turns: 0, scored: 0, totalScore: 0, seconds: 0, withinTime: 0 };
      row.turns += 1;
      if (person.score !== null && person.speakingSeconds >= 1 && person.budgetSeconds > 0) {
        row.scored += 1;
        row.totalScore += person.score;
        row.seconds += person.speakingSeconds;
        if (!person.timeUp && person.speakingSeconds <= person.budgetSeconds) row.withinTime += 1;
      }
      participants.set(person.id, row);
    }
  }
  const sorted = [...participants.values()].map(row => ({ ...row, averageScore: row.scored ? Math.round(row.totalScore / row.scored) : null, averageSeconds: row.scored ? row.seconds / row.scored : null }))
    .sort((a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1) || a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id));
  return sorted.map(row => ({ ...row, rank: row.averageScore === null ? null : sorted.findIndex(other => other.averageScore === row.averageScore) + 1 }));
}