import { sql, type SQL } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { historyCutoff } from './history.ts';
import { WorkspaceError } from './workspace-store.ts';
import { DEFAULT_DISCUSSION_PROMPTS, summarizeRoundFeedback, validateMeetingSettings, validateRoundFeedback, validateRoundId, type FeedbackValue, type MeetingSettings } from './meeting-settings.ts';

type Database = Pick<NeonHttpDatabase, 'execute' | 'batch'>;
async function batch(db: Database, statements: SQL[]) {
  const queries = statements.map(statement => db.execute(statement));
  return db.batch(queries as [typeof queries[number], ...typeof queries[number][]]);
}
const lock = (teamId: string) => sql`SELECT id FROM teams WHERE id=${teamId} FOR UPDATE`;
const settingsStatement = (teamId: string) => sql`SELECT s.revision,p.position,p.prompt FROM teams t LEFT JOIN team_meeting_settings s ON s.team_id=t.id LEFT JOIN team_discussion_prompts p ON p.team_id=t.id WHERE t.id=${teamId} ORDER BY p.position`;
function settingsResult(rows: Record<string, unknown>[]): MeetingSettings {
  if (!rows.length) throw new WorkspaceError(403, 'Équipe inaccessible.');
  const prompts = rows.filter(row => row.prompt !== null).map(row => String(row.prompt));
  return { prompts: prompts.length ? prompts : [...DEFAULT_DISCUSSION_PROMPTS], revision: Number(rows[0].revision ?? 0) };
}
export async function readMeetingSettings(db: Database, teamId: string) {
  return settingsResult((await db.execute(settingsStatement(teamId))).rows);
}
export async function saveMeetingSettings(db: Database, teamId: string, value: unknown) {
  const settings = validateMeetingSettings(value);
  const gate = sql`EXISTS(SELECT 1 FROM team_meeting_settings WHERE team_id=${teamId} AND write_transaction=txid_current())`;
  const results = await batch(db, [
    lock(teamId),
    sql`INSERT INTO team_meeting_settings(team_id) SELECT ${teamId} WHERE EXISTS(SELECT 1 FROM teams WHERE id=${teamId}) ON CONFLICT DO NOTHING`,
    sql`UPDATE team_meeting_settings SET revision=revision+1,write_transaction=txid_current() WHERE team_id=${teamId} AND revision=${settings.revision} RETURNING revision`,
    sql`DELETE FROM team_discussion_prompts WHERE team_id=${teamId} AND ${gate}`,
    ...settings.prompts.map((prompt, position) => sql`INSERT INTO team_discussion_prompts(team_id,position,prompt) SELECT ${teamId},${position},${prompt} WHERE ${gate}`),
    settingsStatement(teamId),
  ]);
  if (!results[0].rows.length) throw new WorkspaceError(403, 'Équipe inaccessible.');
  if (!results[2].rows.length) throw new WorkspaceError(409, 'Les questions ont changé sur un autre appareil. Rechargez avant de les modifier.');
  return settingsResult(results[results.length - 1].rows);
}
const prune = (teamId: string, now: Date) => sql`DELETE FROM standup_sessions WHERE team_id=${teamId} AND completed_at < ${historyCutoff(now).toISOString()}::timestamptz`;
const roundStatement = (teamId: string, roundId: string) => sql`SELECT id FROM standup_sessions WHERE team_id=${teamId} AND id=${roundId}`;
const feedbackStatement = (teamId: string, roundId: string) => sql`SELECT participant_id AS "participantId",value FROM round_feedback WHERE team_id=${teamId} AND session_id=${roundId} ORDER BY participant_id`;
function feedbackResult(roundId: string, rows: Record<string, unknown>[]) {
  return summarizeRoundFeedback(roundId, rows.map(row => ({ participantId: String(row.participantId), value: row.value as FeedbackValue })));
}
export async function readRoundFeedback(db: Database, teamId: string, value: unknown, now = new Date()) {
  const roundId = validateRoundId(value);
  const results = await batch(db, [lock(teamId), prune(teamId, now), roundStatement(teamId, roundId), feedbackStatement(teamId, roundId)]);
  if (!results[2].rows.length) throw new WorkspaceError(404, 'Ce bilan n’est plus disponible.');
  return feedbackResult(roundId, results[3].rows);
}
export async function saveRoundFeedback(db: Database, teamId: string, value: unknown, now = new Date()) {
  const input = validateRoundFeedback(value);
  const results = await batch(db, [
    lock(teamId), prune(teamId, now),
    sql`INSERT INTO round_feedback(team_id,session_id,participant_id,value) SELECT ${teamId},${input.roundId},${input.participantId},${input.value} WHERE EXISTS(SELECT 1 FROM speaking_turns WHERE team_id=${teamId} AND session_id=${input.roundId} AND participant_id=${input.participantId}) ON CONFLICT(team_id,session_id,participant_id) DO UPDATE SET value=excluded.value RETURNING participant_id`,
    feedbackStatement(teamId, input.roundId),
  ]);
  if (!results[2].rows.length) throw new WorkspaceError(404, 'Bilan ou participant archivé introuvable.');
  return feedbackResult(input.roundId, results[3].rows);
}