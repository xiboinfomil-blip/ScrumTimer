import type { TeamState } from '../../types/team.ts';

/** A fresh check-in must not inherit any previous decision to wait. */
export function freshRound(team: TeamState): TeamState {
  return {
    ...team, session: [], postponed: [], currentMoodSlide: null,
    roster: team.roster.map(person => ({ ...person, present: true, mood: null, moodUpdatedAt: null, moodSlide: null })),
  };
}

/** Preserve recorded moods, but require an explicit new postponement after re-entry. */
export function toggleAttendance(team: TeamState, id: string): TeamState {
  if (!team.roster.some(person => person.id === id)) return team;
  return {
    ...team, session: [], postponed: (team.postponed ?? []).filter(candidate => candidate !== id),
    roster: team.roster.map(person => person.id === id ? { ...person, present: !person.present } : person),
  };
}