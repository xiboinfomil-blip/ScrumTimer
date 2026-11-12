import { switchTimerSpeaker, type TimerState, type TimerCheckpoint } from './timer-checkpoint.ts';
import type { TeamState, Mood } from '../../types/team.ts';

export function rejoinTimer(timer: TimerState, person: TimerState['people'][number], order: string[]): TimerState {
  const rank = order.indexOf(person.id);
  const passed = person.started || !timer.activeId || timer.people.some(candidate => order.indexOf(candidate.id) > rank
    && (candidate.id === timer.activeId || candidate.started || candidate.done));
  const people = passed ? [...timer.people.filter(candidate => candidate.id !== person.id), person]
    : timer.people.map(candidate => candidate.id === person.id ? person : candidate);
  const next = { ...timer, people, managing: false };
  return timer.activeId ? next : switchTimerSpeaker({ ...next, focusMode: false }, person.id);
}

export function rejoinCheckpoint(checkpoint: TimerCheckpoint, team: TeamState, id: string, mood: Mood) {
  const current = checkpoint.timer;
  const target = current.people.find(person => person.id === id && person.postponed && !person.done);
  if (!target || current.running || ![1, 2, 3, 4].includes(mood)) return null;
  const moodUpdatedAt = new Date().toISOString();
  const person = { ...target, postponed: false, mood, moodUpdatedAt, moodSlide: team.currentMoodSlide ?? null };
  const nextTeam = { ...team, postponed: team.postponed?.filter(candidate => candidate !== id), roster: team.roster.map(candidate => candidate.id === id ? { ...candidate, mood, moodUpdatedAt, moodSlide: person.moodSlide } : candidate) };
  const timer = rejoinTimer(current, person, checkpoint.session);
  return { team: nextTeam, timer };
}

// A postponed, terminal entry was explicitly excluded, not given a speaking turn.
export const roundSpeakers = (people: TimerState['people']) => people.filter(person => !person.postponed);

export function finishWaitingRound(timer: TimerState): TimerState | null {
  if (timer.activeId || timer.running || !timer.people.some(person => person.postponed && !person.done)
    || timer.people.some(person => !person.postponed && !person.done)
    || !roundSpeakers(timer.people).some(person => person.done)) return null;
  return { ...timer, people: timer.people.map(person => person.postponed ? { ...person, done: true } : person), managing: false, focusMode: false };
}