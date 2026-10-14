import { validatePersonName } from './action-validation.ts';
import { normalizeMoodSlide } from './team-storage.ts';
import { normalizeHistory, type HistoryRound } from './history.ts';
import type { MoodSlideContext, TeamState } from '../types/team.ts';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Objet invalide.');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Champ inconnu.');
}
function id(value: unknown, max = 100): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim() && !/\p{Cc}/u.test(value);
}
function name(value: unknown): value is string {
  return typeof value === 'string' && validatePersonName(value) === null && value === value.trim();
}
function nullableMood(value: unknown) { return value === null || [1, 2, 3, 4].includes(value as number); }
function date(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function slide(value: unknown): MoodSlideContext | null {
  if (value === null || value === undefined) return null;
  const input = object(value);
  keys(input, ['title', 'image', 'slideNumber', 'meterId']);
  const normalized = normalizeMoodSlide(value);
  if (!normalized || (input.title as string).length > 200 || (input.meterId !== undefined && !id(input.meterId, 200))) throw new Error('Diapositive invalide.');
  return normalized;
}
/** Strict transport validation; never repairs, clips or silently defaults durable input. */
export function validateTeamInput(value: unknown): TeamState {
  const input = object(value);
  keys(input, ['roster', 'session', 'duration', 'warning', 'sound', 'usedMoodMeters', 'currentMoodSlide', 'postponed']);
  if (!Array.isArray(input.roster) || input.roster.length > 100 || !Array.isArray(input.session) || !Number.isInteger(input.duration) || (input.duration as number) < 1 || (input.duration as number) > 3659 || ![0, 10, 15, 30, 60].includes(input.warning as number) || typeof input.sound !== 'boolean') throw new Error('Équipe invalide.');
  const seen = new Set<string>();
  const roster = input.roster.map(value => {
    const p = object(value);
    keys(p, ['id', 'name', 'present', 'mood', 'moodUpdatedAt', 'moodSlide']);
    if (!id(p.id) || seen.has(p.id) || !name(p.name) || typeof p.present !== 'boolean' || !nullableMood(p.mood) || !(p.moodUpdatedAt === null || date(p.moodUpdatedAt))) throw new Error('Participant invalide.');
    seen.add(p.id);
    return { id: p.id, name: p.name, present: p.present, mood: p.mood as TeamState['roster'][number]['mood'], moodUpdatedAt: p.moodUpdatedAt as string | null, moodSlide: slide(p.moodSlide) };
  });
  const postponed = input.postponed ?? [];
  if (!Array.isArray(postponed) || postponed.length > 100 || new Set(postponed).size !== postponed.length || postponed.some(value => !id(value) || !roster.some(p => p.id === value && p.present))) throw new Error('Reports invalides.');
  if (input.session.length > 100 || new Set(input.session).size !== input.session.length || input.session.some(value => !id(value) || !roster.some(p => p.id === value && p.present && (p.mood !== null || postponed.includes(value))))) throw new Error('Session invalide.');
  const used = input.usedMoodMeters ?? [];
  if (!Array.isArray(used) || used.length > 2000 || used.some(value => !id(value, 200)) || new Set(used).size !== used.length) throw new Error('Mood meters invalides.');
  slide(input.currentMoodSlide); // Transient state is validated, but never persisted.
  return { roster, duration: input.duration as number, warning: input.warning as number, sound: input.sound, usedMoodMeters: used, session: [], currentMoodSlide: null };
}
export function validateTeamRequest(value: unknown) {
  const input = object(value);
  keys(input, ['team', 'revision']);
  if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 0 || (input.revision as number) >= 2147483647) throw new Error('Révision invalide.');
  return { team: validateTeamInput(input.team), revision: input.revision as number };
}
export function validateHistoryInput(value: unknown, now = new Date()): HistoryRound {
  const input = object(value);
  keys(input, ['id', 'completedAt', 'people']);
  if (!id(input.id) || !/^[\w-]{1,100}$/.test(input.id) || !date(input.completedAt) || !Array.isArray(input.people) || input.people.length < 1 || input.people.length > 100) throw new Error('Bilan invalide.');
  const seen = new Set<string>();
  for (const value of input.people) {
    const p = object(value);
    keys(p, ['id', 'name', 'mood', 'speakingSeconds', 'budgetSeconds', 'timeUp', 'score', 'meterTitle']);
    if (!id(p.id) || seen.has(p.id) || !name(p.name) || !nullableMood(p.mood) || typeof p.timeUp !== 'boolean' || !(p.score === null || (Number.isInteger(p.score) && (p.score as number) >= 0 && (p.score as number) <= 1000)) || !(p.meterTitle === null || (typeof p.meterTitle === 'string' && p.meterTitle.length <= 200)) || [p.speakingSeconds, p.budgetSeconds].some(t => typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > 86400)) throw new Error('Tour invalide.');
    seen.add(p.id);
  }
  const normalized = normalizeHistory([input], now);
  if (normalized.length !== 1) throw new Error('Date du bilan invalide.');
  return normalized[0];
}