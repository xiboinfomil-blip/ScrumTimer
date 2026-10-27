import type { TeamState } from '../types/team.ts';
import { MANUAL_PENALTY_STEP, MAX_MANUAL_PENALTY, validManualPenalty, type SessionSpeaker } from './session-results.ts';
import { hasValidSession, normalizeTeam } from './team-storage.ts';
import { timerFrame } from './timer.ts';

export interface TimerState {
  people: (SessionSpeaker & { postponed: boolean })[];
  activeId: string | null;
  previousId: string | null;
  remaining: number;
  turnTotal: number;
  running: boolean;
  turnStarted: boolean;
  focusMode: boolean;
  managing: boolean;
  ended: boolean;
  warned: boolean;
  deadline: number;
}

export interface TimerCheckpoint {
  version: 1;
  day: string;
  context: string;
  session: string[];
  postponed: string[];
  timer: TimerState;
  roundId: string | null;
}

/** Current-speaker actions never change the lineup, other speakers or metrics. */
export function penalizeCurrentTimer(timer: TimerState): TimerState {
  const person = timer.people.find(candidate => candidate.id === timer.activeId && !candidate.done && !candidate.postponed);
  if (!person || (person.manualPenalty ?? 0) > MAX_MANUAL_PENALTY - MANUAL_PENALTY_STEP) return timer;
  return { ...timer, people: timer.people.map(candidate => candidate === person
    ? { ...candidate, manualPenalty: (candidate.manualPenalty ?? 0) + MANUAL_PENALTY_STEP } : candidate) };
}

export function restartCurrentTimer(timer: TimerState, duration = timer.turnTotal): TimerState {
  if (!timer.people.some(person => person.id === timer.activeId && !person.done && !person.postponed)) return timer;
  // turnStarted=false makes the NEXT start count a retry; restarting alone does not.
  return { ...timer, remaining: duration, turnTotal: duration, running: false, turnStarted: false, ended: false, warned: false, deadline: 0 };
}

export function previousSpeaker(timer: TimerState) {
  if (timer.managing || !timer.activeId) return undefined;
  const index = timer.people.findIndex(person => person.id === timer.activeId);
  return index > 0 ? timer.people.slice(0, index).findLast(person => !person.postponed) : undefined;
}

export function previousTimer(timer: TimerState, duration = timer.turnTotal): TimerState {
  const person = previousSpeaker(timer);
  if (!person) return timer;
  return { ...timer, activeId: person.id, previousId: timer.activeId,
    people: timer.people.map(candidate => candidate === person ? { ...candidate, done: false } : candidate),
    remaining: duration, turnTotal: duration, running: false, turnStarted: false,
    focusMode: true, ended: false, warned: false, deadline: 0 };
}

export const checkpointKey = (teamId: string) => `standup.timer.tab.v1:${teamId}`;
export const checkpointDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Mauritius' }).format(now);
// Session order and postponements are transient. All authoritative roster/check-in
// edits invalidate recovery; sound preferences do not change a speaking turn.
export const checkpointContext = (team: TeamState) => JSON.stringify({ roster: team.roster.map(person => ({ ...person, moodSlide: person.moodSlide ?? null })), duration: team.duration, warning: team.warning });

// Clear immediately, not just when a checkpoint is next read: reverting an edit
// must never make a previously invalidated speaking turn valid again.
export function invalidatesCheckpoint(previous: TeamState, next: TeamState): boolean {
  return checkpointContext(previous) !== checkpointContext(next)
    || (previous.session.length > 0 && next.session.length === 0);
}

export function parseCheckpoint(raw: string | null, team: TeamState, now = new Date()): TimerCheckpoint | null {
  try {
    if (!raw || raw.length > 256000) return null;
    const saved = JSON.parse(raw) as TimerCheckpoint;
    if (saved.version !== 1 || saved.day !== checkpointDay(now) || saved.context !== checkpointContext(team)
      || !Array.isArray(saved.session) || !Array.isArray(saved.postponed)
      || !(saved.roundId === null || (typeof saved.roundId === 'string' && /^[\w-]{1,100}$/.test(saved.roundId)))) return null;
    const context = normalizeTeam({ ...team, session: saved.session, postponed: saved.postponed });
    if (!hasValidSession(context) || JSON.stringify(context.session) !== JSON.stringify(saved.session)
      || JSON.stringify(context.postponed) !== JSON.stringify(saved.postponed)) return null;
    const timer = saved.timer;
    if (!timer || !Array.isArray(timer.people) || timer.people.length !== saved.session.length
      || new Set(timer.people.map(person => person.id)).size !== timer.people.length
      || timer.people.some(person => !saved.session.includes(person.id)
        || ['done', 'started', 'timeUp', 'postponed'].some(key => typeof person[key as keyof typeof person] !== 'boolean')
        || [person.speakingSeconds, person.budgetSeconds, person.attempts].some(value => !Number.isFinite(value) || value < 0 || value > 86400)
        || !Number.isInteger(person.attempts) || !validManualPenalty(person.manualPenalty))
      || [timer.remaining, timer.turnTotal, timer.deadline].some(value => !Number.isFinite(value))
      || timer.turnTotal < 1 || timer.turnTotal > 86400 || Math.abs(timer.remaining) > 86400
      || ['running', 'turnStarted', 'focusMode', 'managing', 'ended', 'warned'].some(key => typeof timer[key as keyof TimerState] !== 'boolean')
      || !(timer.activeId === null || timer.people.some(person => person.id === timer.activeId && !person.postponed))
      || !(timer.previousId === null || saved.session.includes(timer.previousId))
      || (timer.running && (!timer.activeId || !timer.turnStarted || timer.deadline <= 0))) return null;
    // Names, moods and image paths always come from the authoritative roster.
    timer.people = timer.people.map(person => ({ ...person, ...team.roster.find(candidate => candidate.id === person.id)! }));
    timer.managing = false; // Do not reopen a dialog after refresh; its pause stays.
    return { ...saved, timer };
  } catch { return null; }
}

export function recoverTimer(timer: TimerState, now: number): TimerState {
  if (!timer.running) return timer;
  const { remaining, elapsed } = timerFrame(timer.deadline, now, timer.remaining);
  return { ...timer, remaining, people: timer.people.map(person => person.id === timer.activeId
    ? { ...person, speakingSeconds: Math.round((person.speakingSeconds + elapsed) * 1000) / 1000, timeUp: person.timeUp || remaining <= 0 } : person) };
}

export function readCheckpoint(teamId: string, team: TeamState): TimerCheckpoint | null {
  try {
    const key = checkpointKey(teamId);
    const raw = window.sessionStorage.getItem(key);
    const saved = parseCheckpoint(raw, team);
    if (raw && !saved) window.sessionStorage.removeItem(key);
    return saved;
  } catch { return null; }
}

export function writeCheckpoint(teamId: string, team: TeamState, timer: TimerState, roundId: string | null): boolean {
  try {
    window.sessionStorage.setItem(checkpointKey(teamId), JSON.stringify({ version: 1, day: checkpointDay(), context: checkpointContext(team), session: team.session, postponed: team.postponed ?? [], timer, roundId } satisfies TimerCheckpoint));
    return true;
  } catch { return false; }
}

export function clearCheckpoint(teamId: string) {
  try { window.sessionStorage.removeItem(checkpointKey(teamId)); } catch { /* Storage is optional. */ }
}