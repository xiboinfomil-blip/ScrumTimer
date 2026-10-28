import { sql } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import type { TeamSummary } from '../team/team-directory.ts';
import type { JiraSprintSelection } from './jira.ts';
import { JiraService } from './jira-service.ts';
import { jiraAccessToken, jiraRequestCookie } from './jira-auth.ts';
import { readTeam, teamWriteStatements } from '../persistence/relational-store.ts';
import { WorkspaceError } from '../team/workspace-store.ts';
import type { TeamState } from '../../types/team.ts';

type Database = Pick<NeonHttpDatabase, 'execute' | 'batch'>;
export type JiraTeamSprint = JiraSprintSelection & { teamId: string; name: string };
const services = new WeakMap<Request, Promise<JiraService>>();
export function jiraService(db: Database, request: Request) {
  let service = services.get(request);
  if (!service) { service = jiraAccessToken(db, request).then(token => new JiraService(token)); services.set(request, service); }
  return service;
}
export async function jiraTeamSprint(db: Database, teamId: string): Promise<JiraTeamSprint | null> {
  const { rows } = await db.execute(sql`SELECT team_id,cloud_id,board_id,sprint_id,sprint_name FROM jira_team_sprints WHERE team_id=${teamId}`);
  const row = rows[0];
  return row ? { teamId, cloudId: String(row.cloud_id), boardId: Number(row.board_id), sprintId: Number(row.sprint_id), name: String(row.sprint_name) } : null;
}
export async function authorizeJiraTeam(db: Database, request: Request, teamId: string) {
  const sprint = await jiraTeamSprint(db, teamId);
  if (sprint) await (await jiraService(db, request)).authorize(sprint.cloudId, sprint.boardId);
  return sprint;
}
export async function visibleJiraTeams(db: Database, request: Request, list: { teams: TeamSummary[]; activeTeamId: string | null }) {
  const { rows } = await db.execute(sql`SELECT team_id,cloud_id,board_id,sprint_name FROM jira_team_sprints`);
  const links = new Map(rows.map(row => [String(row.team_id), row]));
  const teams: TeamSummary[] = [];
  for (const team of list.teams) {
    const link = links.get(team.id);
    if (!link) { teams.push({ ...team, kind: 'ordinary' }); continue; }
    const locked: TeamSummary = { id: team.id, name: team.name, memberCount: 0, category: null, favorite: false, kind: 'sprint', jiraLocked: true };
    if (!jiraRequestCookie(request)) { teams.push(locked); continue; }
    try {
      await (await jiraService(db, request)).authorize(String(link.cloud_id), Number(link.board_id));
      teams.push({ ...team, kind: 'sprint', sprintName: String(link.sprint_name) });
    } catch { teams.push(locked); }
  }
  return { teams, activeTeamId: teams.some(team => team.id === list.activeTeamId && !team.jiraLocked) ? list.activeTeamId : teams.find(team => !team.jiraLocked)?.id ?? null };
}
export async function assertJiraRoster(db: Database, teamId: string, team: TeamState) {
  if (!await jiraTeamSprint(db, teamId)) return;
  const current = (await readTeam(db, teamId)).team;
  const names = new Map(current?.roster.map(person => [person.id, person.name]));
  if (team.roster.length !== names.size || team.roster.some(person => names.get(person.id) !== person.name)) throw new WorkspaceError(400, 'Les participants de cette équipe sont gérés par le sprint Jira.');
}
export async function syncJiraRoster(db: Database, request: Request, teamId: string, revision: number, selection: JiraSprintSelection) {
  const existing = await authorizeJiraTeam(db, request, teamId);
  if (!existing || existing.cloudId !== selection.cloudId || existing.boardId !== selection.boardId) throw new WorkspaceError(400, 'Choisissez un sprint du tableau lié à cette équipe.');
  const imported = await (await jiraService(db, request)).importSprint(selection);
  const roster = imported.roster;
  const current = await readTeam(db, teamId);
  if (!current.team || current.revision !== revision) throw new WorkspaceError(409, 'Équipe modifiée. Rechargez avant de synchroniser.');
  const previous = new Map(current.team.roster.map(person => [person.id, person]));
  const next: TeamState = { ...current.team, session: [], postponed: [], roster: roster.map(person => ({ ...previous.get(person.id), ...person, present: previous.get(person.id)?.present ?? true })) };
  const queries = [sql`SELECT id FROM teams WHERE id=${teamId} FOR UPDATE`,
    sql`UPDATE jira_team_sprints SET sprint_id=${selection.sprintId},sprint_name=${imported.name} WHERE team_id=${teamId} AND EXISTS(SELECT 1 FROM teams WHERE id=${teamId} AND revision=${revision}) RETURNING team_id`];
  const writes = [...queries, ...teamWriteStatements(teamId, revision, next)].map(statement => db.execute(statement));
  const results = await db.batch(writes as [typeof writes[number], ...typeof writes[number][]]);
  if (!results[2].rows.length) throw new WorkspaceError(409, 'Équipe modifiée. Rechargez avant de synchroniser.');
  return { count: roster.length };
}