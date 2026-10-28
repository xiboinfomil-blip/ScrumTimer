import { sql, type SQL } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { validateDailyHint, type DailyHintsData } from './daily-hints.ts';
import { mauritiusDay, WorkspaceError } from '../team/workspace-store.ts';

type Database = Pick<NeonHttpDatabase, 'execute' | 'batch'>;
async function batch(db: Database, statements: SQL[]) {
  const queries = statements.map(statement => db.execute(statement));
  return db.batch(queries as [typeof queries[number], ...typeof queries[number][]]);
}
const lock = (teamId: string) => sql`SELECT id FROM teams WHERE id=${teamId} FOR UPDATE`;
// Global, strictly-past-day cleanup also expires teams that are never reopened.
const prune = (day: string) => sql`DELETE FROM participant_daily_hints WHERE day < ${day}::date`;
const hintsStatement = (teamId: string, day: string) => sql`SELECT h.participant_id AS "participantId",h.hint,h.revision FROM participant_daily_hints h JOIN team_members m ON m.team_id=h.team_id AND m.participant_id=h.participant_id WHERE h.team_id=${teamId} AND h.day=${day}::date ORDER BY m.position`;
function result(day: string, rows: Record<string, unknown>[]): DailyHintsData {
  return { day, hints: rows.map(row => ({ participantId: String(row.participantId), hint: String(row.hint), revision: Number(row.revision) })) };
}
export async function readDailyHints(db: Database, teamId: string, now = new Date()): Promise<DailyHintsData> {
  const day = mauritiusDay(now);
  const results = await batch(db, [lock(teamId), prune(day), hintsStatement(teamId, day)]);
  if (!results[0].rows.length) throw new WorkspaceError(403, 'Équipe inaccessible.');
  return result(day, results[2].rows);
}
export async function saveDailyHint(db: Database, teamId: string, value: unknown, now = new Date()): Promise<DailyHintsData> {
  let input;
  try { input = validateDailyHint(value); }
  catch (error) { throw new WorkspaceError(400, error instanceof Error ? error.message : 'Indice invalide.'); }
  const day = mauritiusDay(now);
  if (input.day !== day) throw new WorkspaceError(409, 'La journée a changé. Rechargez avant d’enregistrer votre indice.');
  const results = await batch(db, [
    lock(teamId), prune(day),
    sql`SELECT participant_id FROM team_members WHERE team_id=${teamId} AND participant_id=${input.participantId}`,
    // A nonzero expected revision must never create a missing/expired row.
    // A zero revision creates only; it cannot overwrite an existing daily hint.
    sql`INSERT INTO participant_daily_hints(team_id,participant_id,day,hint,revision)
      SELECT ${teamId},${input.participantId},${day}::date,${input.hint},1
      WHERE EXISTS(SELECT 1 FROM team_members WHERE team_id=${teamId} AND participant_id=${input.participantId})
        AND (${input.revision}=0 OR EXISTS(SELECT 1 FROM participant_daily_hints WHERE team_id=${teamId} AND participant_id=${input.participantId} AND day=${day}::date AND revision=${input.revision}))
      ON CONFLICT(team_id,participant_id) DO UPDATE SET hint=excluded.hint,revision=participant_daily_hints.revision+1
      WHERE participant_daily_hints.day=excluded.day AND participant_daily_hints.revision=${input.revision}
      RETURNING participant_id`,
    hintsStatement(teamId, day),
  ]);
  if (!results[0].rows.length) throw new WorkspaceError(403, 'Équipe inaccessible.');
  if (!results[2].rows.length) throw new WorkspaceError(404, 'Ce participant ne fait plus partie de l’équipe.');
  if (!results[3].rows.length) throw new WorkspaceError(409, 'L’indice a changé sur un autre appareil. Rechargez avant de le modifier.');
  return result(day, results[4].rows);
}