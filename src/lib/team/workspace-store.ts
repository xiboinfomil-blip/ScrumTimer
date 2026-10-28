import { randomBytes } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import catalog from '../mood/remote-mood-catalog.json' with { type: 'json' };
import type { TeamState } from '../../types/team.ts';
import type { JiraParticipant, JiraSprintSelection } from '../jira/jira.ts';
import { validateTeamCategory, validateTeamDirectoryPatch, type TeamCategory, type TeamSummary } from './team-directory.ts';
import { mauritiusDay } from '@infomil/scrum-shared/statistics';
export { mauritiusDay } from '@infomil/scrum-shared/statistics';

type Database = Pick<NeonHttpDatabase, 'execute' | 'batch'>;
export type DailyMeter = { meterId: string; title: string };
export class WorkspaceError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const forbidden = () => new WorkspaceError(403, 'Équipe inaccessible.');
export const capabilityId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const newTeamId = () => randomBytes(32).toString('hex');

export function validateTeamName(value: unknown): string {
  if (typeof value !== 'string' || /\p{Cc}/u.test(value)) throw new WorkspaceError(400, 'Nom d’équipe invalide.');
  const name = value.trim();
  if (name.length < 1 || name.length > 60) throw new WorkspaceError(400, 'Le nom doit contenir entre 1 et 60 caractères.');
  return name;
}
export function strictObject(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length || Object.keys(value).some(key => !fields.includes(key))) throw new WorkspaceError(400, 'Requête invalide.');
  return value as Record<string, unknown>;
}
export function validateDailyMeter(value: unknown, source: { id: string; title: string }[] = catalog): DailyMeter {
  const input = strictObject(value, ['meterId', 'title']);
  if (typeof input.meterId !== 'string' || input.meterId.length > 200 || typeof input.title !== 'string' || input.title.length > 200) throw new WorkspaceError(400, 'Baromètre invalide.');
  const title = input.meterId === 'original' ? 'Baromètre original' : source.find(meter => meter.id === input.meterId)?.title;
  // Only the published remote catalogue and the built-in meter are authorized.
  if (!title || title !== input.title) throw new WorkspaceError(400, 'Baromètre inconnu ou titre invalide.');
  return { meterId: input.meterId, title };
}
async function databaseDailyMeter(db: Database, value: unknown) {
  const input = strictObject(value, ['meterId', 'title']);
  if (input.meterId === 'original') return validateDailyMeter(value);
  if (typeof input.meterId !== 'string' || !/^deck-[a-f0-9]{20}$/.test(input.meterId)) throw new WorkspaceError(400, 'Baromètre invalide.');
  const rows = await db.execute(sql`SELECT id,title FROM remote_mood_catalog WHERE id=${input.meterId}`);
  return validateDailyMeter(value, rows.rows as { id: string; title: string }[]);
}
async function batch(db: Database, statements: SQL[]) {
  const queries = statements.map(statement => db.execute(statement));
  return db.batch(queries as [typeof queries[number], ...typeof queries[number][]]);
}
// A single database namespace, not a browser identity. Legacy rows stay visible.
const sharedWorkspace = '0'.repeat(64);
const listStatement = () => sql`SELECT t.id,t.name,t.category,t.favorite,(SELECT count(*)::int FROM team_members m WHERE m.team_id=t.id) AS "memberCount" FROM teams t ORDER BY lower(t.name),t.id`;
function listResult(rows: Record<string, unknown>[], selectedId: string | null = null) {
  const teams: TeamSummary[] = rows.map(row => ({ id: String(row.id), name: String(row.name), memberCount: Number(row.memberCount), category: validateTeamCategory(row.category ?? null), favorite: row.favorite === true }));
  return { teams, activeTeamId: selectedId ?? (rows.length ? String(rows[0].id) : null) };
}
export async function listTeams(db: Database) {
  // Bootstrap only when the shared namespace is first inserted, never after
  // deleting its last team. Existing legacy teams remain the initial roster.
  const results = await batch(db, [
    sql`WITH new_workspace AS (INSERT INTO workspaces(id) VALUES(${sharedWorkspace}) ON CONFLICT DO NOTHING RETURNING id) INSERT INTO teams(id,workspace_id,name,duration,warning,sound) SELECT id,id,'Mon équipe',120,30,true FROM new_workspace WHERE NOT EXISTS(SELECT 1 FROM teams) ON CONFLICT DO NOTHING`,
    sql`SELECT id FROM workspaces WHERE id=${sharedWorkspace} FOR UPDATE`,
    listStatement(),
  ]);
  return listResult(results[2].rows);
}
/** Explicit headers never fall back to another team, even when malformed. */
export async function resolveSelectedTeam(db: Database, explicitId: string | null): Promise<string> {
  if (!capabilityId(explicitId)) throw forbidden();
  const result = await db.execute(sql`SELECT id FROM teams WHERE id=${explicitId}`);
  if (!result.rows.length) throw forbidden();
  return String(result.rows[0].id);
}
export async function createTeam(db: Database, value: unknown, category: TeamCategory | null = null, sprint?: JiraSprintSelection & { name: string; roster: JiraParticipant[] }) {
  try { validateTeamCategory(category); }
  catch { throw new WorkspaceError(400, 'Catégorie d’équipe invalide.'); }
  const name = validateTeamName(value); const id = newTeamId();
  const results = await batch(db, [
    sql`INSERT INTO workspaces(id) VALUES(${sharedWorkspace}) ON CONFLICT DO NOTHING`,
    sql`SELECT id FROM workspaces WHERE id=${sharedWorkspace} FOR UPDATE`,
    sql`INSERT INTO teams(id,workspace_id,name,category,duration,warning,sound) SELECT ${id},${sharedWorkspace},${name},${category},120,30,true WHERE NOT EXISTS(SELECT 1 FROM teams WHERE lower(name)=lower(${name})) RETURNING id`,
    ...(sprint ? [
      sql`INSERT INTO jira_team_sprints(team_id,cloud_id,board_id,sprint_id,sprint_name) SELECT ${id},${sprint.cloudId},${sprint.boardId},${sprint.sprintId},${sprint.name} WHERE EXISTS(SELECT 1 FROM teams WHERE id=${id})`,
      sql`INSERT INTO participants(team_id,id,name) SELECT ${id},p.id,p.name FROM jsonb_to_recordset(${JSON.stringify(sprint.roster)}::jsonb) AS p(id text,name text) WHERE EXISTS(SELECT 1 FROM teams WHERE id=${id})`,
      sql`INSERT INTO team_members(team_id,participant_id,position,present) SELECT ${id},p.value->>'id',(p.position-1)::int,true FROM jsonb_array_elements(${JSON.stringify(sprint.roster)}::jsonb) WITH ORDINALITY AS p(value,position) WHERE EXISTS(SELECT 1 FROM teams WHERE id=${id})`,
    ] : []),
    listStatement(),
  ]);
  if (!results[2].rows.length) throw new WorkspaceError(409, 'Une équipe porte déjà ce nom, ou votre sélection est indisponible.');
  return listResult(results.at(-1)!.rows, id);
}
export async function deleteTeam(db: Database, value: unknown) {
  const input = strictObject(value, ['teamId', 'name']);
  if (!capabilityId(input.teamId)) throw new WorkspaceError(400, 'Équipe invalide.');
  validateTeamName(input.name);
  const teamId = input.teamId; const name = input.name as string;
  const results = await batch(db, [
    sql`INSERT INTO workspaces(id) VALUES(${sharedWorkspace}) ON CONFLICT DO NOTHING`,
    sql`SELECT id FROM workspaces WHERE id=${sharedWorkspace} FOR UPDATE`,
    sql`SELECT id,name FROM teams WHERE id=${teamId} FOR UPDATE`,
    // Immediate NO ACTION references can be checked before indirect root
    // cascades finish. Remove these dependents first in the same transaction;
    // sessions cascade their speaking turns before meters vanish.
    sql`DELETE FROM participant_check_ins WHERE team_id=${teamId} AND EXISTS(SELECT 1 FROM teams WHERE id=${teamId} AND name=${name})`,
    sql`DELETE FROM team_daily_meters WHERE team_id=${teamId} AND EXISTS(SELECT 1 FROM teams WHERE id=${teamId} AND name=${name})`,
    sql`DELETE FROM standup_sessions WHERE team_id=${teamId} AND EXISTS(SELECT 1 FROM teams WHERE id=${teamId} AND name=${name})`,
    sql`DELETE FROM teams WHERE id=${teamId} AND name=${name} RETURNING id`,
    listStatement(),
  ]);
  if (!results[2].rows.length) throw new WorkspaceError(404, 'Équipe introuvable.');
  if (!results[6].rows.length) throw new WorkspaceError(409, 'Le nom de confirmation ne correspond pas au nom de l’équipe.');
  return listResult(results[7].rows);
}
export async function selectTeam(db: Database, teamId: unknown) {
  if (!capabilityId(teamId)) throw forbidden();
  const rows = (await db.execute(listStatement())).rows;
  if (!rows.some(row => row.id === teamId)) throw forbidden();
  // Selection is returned to React only; it never updates a device record.
  return listResult(rows, teamId);
}
/** Shared metadata only: never touches roster revision, timestamps or sessions. */
export async function updateTeamDirectory(db: Database, value: unknown) {
  let input;
  try {
    input = validateTeamDirectoryPatch(value);
    if (!('category' in input) && !('favorite' in input)) throw new TypeError();
  } catch { throw new WorkspaceError(400, 'Métadonnées d’équipe invalides.'); }
  const teamId = input.teamId;
  const assignment = 'category' in input ? sql`category=${input.category}` : sql`favorite=${input.favorite}`;
  const results = await batch(db, [
    sql`INSERT INTO workspaces(id) VALUES(${sharedWorkspace}) ON CONFLICT DO NOTHING`,
    sql`SELECT id FROM workspaces WHERE id=${sharedWorkspace} FOR UPDATE`,
    sql`SELECT id FROM teams WHERE id=${teamId} FOR UPDATE`,
    sql`UPDATE teams SET ${assignment} WHERE id=${teamId} RETURNING id`,
    listStatement(),
  ]);
  if (!results[3].rows.length) throw new WorkspaceError(404, 'Équipe introuvable.');
  return listResult(results[4].rows, teamId);
}
const dailyStatement = (teamId: string, day: string) => sql`SELECT meter_id AS "meterId",title FROM team_daily_meters WHERE team_id=${teamId} AND day=${day}::date`;
function dailyResult(day: string, rows: Record<string, unknown>[]) {
  return { day, meter: rows.length ? { meterId: String(rows[0].meterId), title: String(rows[0].title) } : null };
}
export async function readDailyMeter(db: Database, teamId: string, now = new Date()) {
  const day = mauritiusDay(now);
  return dailyResult(day, (await db.execute(dailyStatement(teamId, day))).rows);
}
export async function saveDailyMeter(db: Database, teamId: string, value: unknown, now = new Date()) {
  const meter = await databaseDailyMeter(db, value); const day = mauritiusDay(now);
  const results = await batch(db, [
    // Same team lock as profile/history writes. INSERT never overwrites a winner.
    sql`SELECT id FROM teams WHERE id=${teamId} FOR UPDATE`,
    sql`INSERT INTO mood_meter_identifiers(team_id,id) VALUES(${teamId},${meter.meterId}) ON CONFLICT DO NOTHING`,
    sql`INSERT INTO team_daily_meters(team_id,day,meter_id,title) VALUES(${teamId},${day}::date,${meter.meterId},${meter.title}) ON CONFLICT(team_id,day) DO NOTHING`,
    dailyStatement(teamId, day),
  ]);
  return dailyResult(day, results[3].rows);
}
/** Optional daily consistency check; legacy transport validation stays unchanged. */
export async function changeDailyMeter(db: Database, teamId: string, value: unknown, now = new Date()) {
  const meter = await databaseDailyMeter(db, value); const day = mauritiusDay(now);
  const results = await batch(db, [
    sql`SELECT id FROM teams WHERE id=${teamId} FOR UPDATE`,
    sql`INSERT INTO mood_meter_identifiers(team_id,id) VALUES(${teamId},${meter.meterId}) ON CONFLICT DO NOTHING`,
    sql`UPDATE team_daily_meters SET meter_id=${meter.meterId},title=${meter.title} WHERE team_id=${teamId} AND day=${day}::date AND NOT EXISTS(SELECT 1 FROM participant_check_ins WHERE team_id=${teamId} AND mood IS NOT NULL AND (mood_updated_at AT TIME ZONE 'Indian/Mauritius')::date=${day}::date) AND NOT EXISTS(SELECT 1 FROM standup_sessions WHERE team_id=${teamId} AND (completed_at AT TIME ZONE 'Indian/Mauritius')::date=${day}::date) RETURNING meter_id`,
    dailyStatement(teamId, day),
  ]);
  if (!results[2].rows.length) throw new WorkspaceError(409, 'Le baromètre ne peut plus changer après le premier vote ou la fin du point quotidien. Rechargez pour retrouver le choix partagé.');
  return dailyResult(day, results[3].rows);
}

export function validateDailyCheckIns(team: TeamState, meter: DailyMeter | null) {
  if (!meter) return;
  for (const person of team.roster) {
    if (person.mood === null) continue;
    if (meter.meterId === 'original' && !person.moodSlide) continue;
    if (person.moodSlide?.meterId !== meter.meterId) throw new WorkspaceError(400, 'Utilisez le baromètre du jour pour chaque participant.');
  }
}