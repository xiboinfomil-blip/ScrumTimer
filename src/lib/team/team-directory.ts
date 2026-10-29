/** Shared directory metadata, independent of roster/session state and browser APIs. */
import { validateJiraSelection, type JiraSprintSelection } from '../jira/jira.ts';
export const teamCategories = ['Tech', 'Produit', 'Support', 'Marketing'] as const;
export type TeamCategory = typeof teamCategories[number];
export type TeamSummary = { id: string; name: string; memberCount: number; category: TeamCategory | null; favorite?: boolean; kind?: 'ordinary' | 'sprint'; sprintName?: string; jiraLocked?: boolean };
export type TeamCreation = { name: unknown; category: TeamCategory | null; sprint?: JiraSprintSelection };
export type TeamDirectoryUpdate = { teamId: string; category: TeamCategory | null };
export type TeamDirectoryPatch = { teamId: string } | TeamDirectoryUpdate;

export function isTeamCategory(value: unknown): value is TeamCategory {
  return typeof value === 'string' && teamCategories.some(category => category === value);
}
export function validateTeamCategory(value: unknown): TeamCategory | null {
  if (value === null || isTeamCategory(value)) return value;
  throw new TypeError('Catégorie d’équipe invalide.');
}
function exactObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw new TypeError('Requête invalide.');
  return value as Record<string, unknown>;
}
/** Old {name} clients create an uncategorized team, never an implicit Tech team. */
export function validateTeamCreation(value: unknown): TeamCreation {
  if (value && typeof value === 'object' && Object.hasOwn(value, 'kind')) {
    const kind = (value as { kind: unknown }).kind;
    const input = exactObject(value, kind === 'sprint' ? ['name', 'category', 'kind', 'sprint'] : ['name', 'category', 'kind']);
    if (kind !== 'ordinary' && kind !== 'sprint') throw new TypeError('Type d’équipe invalide.');
    return { name: input.name, category: validateTeamCategory(input.category), ...(kind === 'sprint' ? { sprint: validateJiraSelection(input.sprint) } : {}) };
  }
  const withCategory = !!value && typeof value === 'object' && Object.hasOwn(value, 'category');
  const input = exactObject(value, withCategory ? ['name', 'category'] : ['name']);
  return { name: input.name, category: withCategory ? validateTeamCategory(input.category) : null };
}
/** Presence, not truthiness, discriminates absolute metadata assignments. */
export function validateTeamDirectoryPatch(value: unknown): TeamDirectoryPatch {
  const keys = value && typeof value === 'object' ? Object.keys(value) : [];
  const field = keys.includes('category') ? 'category' : null;
  const input = exactObject(value, field ? ['teamId', field] : ['teamId']);
  if (typeof input.teamId !== 'string' || !/^[a-f0-9]{64}$/.test(input.teamId)) throw new TypeError('Équipe invalide.');
  if (field === 'category') return { teamId: input.teamId, category: validateTeamCategory(input.category) };
  return { teamId: input.teamId };
}

export function filterTeams<T extends TeamSummary>(teams: readonly T[], filters: { category?: TeamCategory | null; favoritesOnly?: boolean } = {}): T[] {
  return teams.filter(team => (filters.category === undefined || team.category === filters.category) && (!filters.favoritesOnly || team.favorite === true));
}