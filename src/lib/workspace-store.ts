import { randomBytes } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import catalog from './remote-mood-catalog.json' with { type: 'json' };
import type { TeamState } from '../types/team.ts';

type Database = Pick<NeonHttpDatabase, 'execute' | 'batch'>;
export type DailyMeter = { meterId: string; title: string };
export class WorkspaceError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const forbidden = () => new WorkspaceError(403, 'Équipe inaccessible.');
export const capabilityId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const newTeamId = () => randomBytes(32).toString('hex');

/** Calendar date at the server, independent of the browser/system timezone. */
export function mauritiusDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Indian/Mauritius', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
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
export function validateDailyMeter(value: unknown): DailyMeter {
  const input = strictObject(value, ['meterId', 'title']);
  if (typeof input.meterId !== 'string' || input.meterId.length > 200 || typeof input.title !== 'string' || input.title.length > 200) throw new WorkspaceError(400, 'Baromètre invalide.');
  const title = input.meterId === 'original' ? 'Baromètre original' : catalog.find(meter => meter.id === input.meterId)?.title;
  // Only the published remote catalogue and the built-in meter are authorized.
  if (!title || title !== input.title) throw new WorkspaceError(400, 'Baromètre inconnu ou titre invalide.');
  return { meterId: input.meterId, title };
}
async function batch(db: Database, statements: SQL[]) {
  const queries = statements.map(statement => db.execute(statement));
  return db.batch(queries as [typeof queries[number], ...typeof queries[number][]]);
}
const listStatement = (workspaceId: string) => sql`SELECT t.id,t.name,(SELECT count(*)::int FROM team_members m WHERE m.team_id=t.id) AS "memberCount",w.selected_team_id AS "activeTeamId" FROM teams t JOIN workspaces w ON w.id=t.workspace_id WHERE w.id=${workspaceId} ORDER BY lower(t.name),t.id`;
function listResult(rows: Record<string, unknown>[]) {
  return { teams: rows.map(row => ({ id: String(row.id), name: String(row.name), memberCount: Number(row.memberCount) })), activeTeamId: rows.length ? String(rows[0].activeTeamId) : null };
}
export async function listTeams(db: Database, workspaceId: string) {
  if (!capabilityId(workspaceId)) throw forbidden();
  // Serialize bootstrap/selection on the workspace; concurrent GETs create ONE default.
  const results = await batch(db, [
    sql`INSERT INTO workspaces(id) VALUES(${workspaceId}) ON CONFLICT DO NOTHING`,
    sql`SELECT id FROM workspaces WHERE id=${workspaceId} FOR UPDATE`,
    sql`INSERT INTO teams(id,workspace_id,name,duration,warning,sound) SELECT ${workspaceId},${workspaceId},'Mon équipe',120,30,true WHERE NOT EXISTS(SELECT 1 FROM teams WHERE workspace_id=${workspaceId}) ON CONFLICT DO NOTHING`,
    sql`UPDATE workspaces w SET selected_team_id=(SELECT id FROM teams WHERE workspace_id=w.id ORDER BY lower(name),id LIMIT 1) WHERE w.id=${workspaceId} AND NOT EXISTS(SELECT 1 FROM teams WHERE id=w.selected_team_id AND workspace_id=w.id)`,
    listStatement(workspaceId),
  ]);
  return listResult(results[4].rows);
}
/** Explicit headers never fall back to another team, even when malformed. */
export async function resolveSelectedTeam(db: Database, workspaceId: string, explicitId: string | null = null): Promise<string> {
  if (!capabilityId(workspaceId) || (explicitId !== null && !capabilityId(explicitId))) throw forbidden();
  const result = await db.execute(sql`SELECT t.id FROM teams t JOIN workspaces w ON w.id=t.workspace_id WHERE w.id=${workspaceId} AND t.id=${explicitId === null ? sql`w.selected_team_id` : sql`${explicitId}`}`);
  if (!result.rows.length) throw forbidden();
  return String(result.rows[0].id);
}
export async function createTeam(db: Database, workspaceId: string, value: unknown) {
  const name = validateTeamName(value); const id = newTeamId();
  if (!capabilityId(workspaceId)) throw forbidden();
  const results = await batch(db, [
    sql`SELECT id FROM workspaces WHERE id=${workspaceId} FOR UPDATE`,
    sql`INSERT INTO teams(id,workspace_id,name,duration,warning,sound) SELECT ${id},${workspaceId},${name},120,30,true WHERE EXISTS(SELECT 1 FROM workspaces WHERE id=${workspaceId}) RETURNING id`,
    sql`UPDATE workspaces SET selected_team_id=${id} WHERE id=${workspaceId} AND EXISTS(SELECT 1 FROM teams WHERE id=${id} AND workspace_id=${workspaceId})`,
    listStatement(workspaceId),
  ]);
  if (!results[1].rows.length) throw forbidden();
  return listResult(results[3].rows);
}
export async function selectTeam(db: Database, workspaceId: string, teamId: unknown) {
  if (!capabilityId(workspaceId) || !capabilityId(teamId)) throw forbidden();
  const results = await batch(db, [
    sql`UPDATE workspaces SET selected_team_id=${teamId} WHERE id=${workspaceId} AND EXISTS(SELECT 1 FROM teams WHERE id=${teamId} AND workspace_id=${workspaceId}) RETURNING id`,
    listStatement(workspaceId),
  ]);
  if (!results[0].rows.length) throw forbidden();
  return listResult(results[1].rows);
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
  const meter = validateDailyMeter(value); const day = mauritiusDay(now);
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
export function validateDailyCheckIns(team: TeamState, meter: DailyMeter | null) {
  if (!meter) return;
  for (const person of team.roster) {
    if (person.mood === null) continue;
    if (meter.meterId === 'original' && !person.moodSlide) continue;
    if (person.moodSlide?.meterId !== meter.meterId) throw new WorkspaceError(400, 'Utilisez le baromètre du jour pour chaque participant.');
  }
}