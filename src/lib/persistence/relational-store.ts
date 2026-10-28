import { sql, type SQL } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import type { TeamState } from '../../types/team.ts';
import type { HistoryRound } from '../history/history.ts';
import { pruneHistoryStatement } from '../history/retention.ts';
import { HISTORY_LIMIT } from '@infomil/scrum-shared/statistics';
import { mauritiusDay, WorkspaceError } from '../team/workspace-store.ts';

type Database = Pick<NeonHttpDatabase, 'execute' | 'batch'>;
// Transaction IDs are server-generated, unique gates, NOT revision+1 (which a stale
// writer could match). Neon batch executes every statement in one transaction.
const teamGate = (id: string) => sql`EXISTS (SELECT 1 FROM teams WHERE id=${id} AND write_transaction=txid_current())`;
const historyGate = (id: string, round: string) => sql`EXISTS (SELECT 1 FROM standup_sessions WHERE team_id=${id} AND id=${round} AND write_transaction=txid_current())`;
const recordset = (value: unknown) => sql`jsonb_to_recordset(${JSON.stringify(value)}::jsonb)`;

export function teamWriteStatements(id: string, revision: number, team: TeamState): SQL[] {
  const gate = teamGate(id);
  const people = recordset(team.roster.map((p, position) => ({ ...p, position, title: p.moodSlide?.title ?? null, image: p.moodSlide?.image ?? null, number: p.moodSlide?.slideNumber ?? null, identifier: p.moodSlide?.meterId ?? null })));
  const fields = sql`AS p(id text,name text,present boolean,mood integer,"moodUpdatedAt" text,position integer,title text,image text,number integer,identifier text)`;
  const used = recordset((team.usedMoodMeters ?? []).map((id, position) => ({ id, position })));
  return [
    // Teams are created by the workspace API at revision 1, never by profile PUT.
    // The daily rule shares the UPDATE lock with daily selection, preventing races.
    sql`UPDATE teams SET revision=revision+1,duration=${team.duration},warning=${team.warning},sound=${team.sound},write_transaction=txid_current() WHERE id=${id} AND revision=${revision} AND NOT EXISTS(SELECT 1 FROM team_daily_meters d CROSS JOIN ${people} ${fields} WHERE d.team_id=${id} AND d.day=(now() AT TIME ZONE 'Indian/Mauritius')::date AND p.mood IS NOT NULL AND p.identifier IS DISTINCT FROM d.meter_id AND NOT(d.meter_id='original' AND p.identifier IS NULL AND p.image IS NULL)) RETURNING revision`,
    sql`INSERT INTO participants(team_id,id,name) SELECT ${id},p.id,p.name FROM ${people} ${fields} WHERE ${gate} ON CONFLICT(team_id,id) DO UPDATE SET name=excluded.name`,
    sql`INSERT INTO mood_meters(team_id,id,title) SELECT DISTINCT ${id},p.title,p.title FROM ${people} ${fields} WHERE ${gate} AND p.title IS NOT NULL ON CONFLICT DO NOTHING`,
    sql`INSERT INTO mood_meter_identifiers(team_id,id) SELECT ${id},identifier FROM (SELECT p.identifier FROM ${people} ${fields} UNION SELECT u.id FROM ${used} AS u(id text,position integer)) x WHERE ${gate} AND identifier IS NOT NULL ON CONFLICT DO NOTHING`,
    sql`INSERT INTO mood_meter_slides(team_id,id,meter_id,image,slide_number) SELECT DISTINCT ${id},md5(jsonb_build_array(p.title,p.image,p.number)::text),p.title,p.image,p.number FROM ${people} ${fields} WHERE ${gate} AND p.image IS NOT NULL ON CONFLICT DO NOTHING`,
    sql`DELETE FROM participant_check_ins WHERE team_id=${id} AND ${gate}`,
    sql`DELETE FROM team_members WHERE team_id=${id} AND ${gate}`,
    sql`DELETE FROM team_used_mood_meters WHERE team_id=${id} AND ${gate}`,
    sql`INSERT INTO team_members(team_id,participant_id,position,present) SELECT ${id},p.id,p.position,p.present FROM ${people} ${fields} WHERE ${gate}`,
    sql`INSERT INTO participant_check_ins(team_id,participant_id,mood,mood_updated_at,slide_id,identifier_id) SELECT ${id},p.id,p.mood,p."moodUpdatedAt"::timestamptz,CASE WHEN p.image IS NOT NULL THEN md5(jsonb_build_array(p.title,p.image,p.number)::text) END,p.identifier FROM ${people} ${fields} WHERE ${gate}`,
    sql`INSERT INTO team_used_mood_meters(team_id,identifier_id,position) SELECT ${id},u.id,u.position FROM ${used} AS u(id text,position integer) WHERE ${gate}`,
  ];
}
export function historyWriteStatements(id: string, round: HistoryRound, now = new Date()): SQL[] {
  const gate = historyGate(id, round.id);
  const people = recordset(round.people.map((p, position) => ({ ...p, position })));
  const fields = sql`AS p(id text,name text,mood integer,"speakingSeconds" double precision,"budgetSeconds" double precision,"timeUp" boolean,score integer,"meterTitle" text,position integer)`;
  return [
    // Serialize against profile CAS, without changing its revision or write gate.
    sql`SELECT id FROM teams WHERE id=${id} FOR UPDATE`,
    sql`INSERT INTO standup_sessions(team_id,id,completed_at,write_transaction) SELECT ${id},${round.id},${round.completedAt}::timestamptz,txid_current() WHERE EXISTS(SELECT 1 FROM teams WHERE id=${id}) AND NOT EXISTS(SELECT 1 FROM standup_sessions WHERE team_id=${id} AND (completed_at AT TIME ZONE 'Indian/Mauritius')::date=${mauritiusDay(now)}::date) ON CONFLICT DO NOTHING RETURNING id`,
    sql`INSERT INTO participants(team_id,id,name) SELECT ${id},p.id,p.name FROM ${people} ${fields} WHERE ${gate} ON CONFLICT DO NOTHING`,
    sql`INSERT INTO mood_meters(team_id,id,title) SELECT DISTINCT ${id},p."meterTitle",p."meterTitle" FROM ${people} ${fields} WHERE ${gate} AND p."meterTitle" IS NOT NULL ON CONFLICT DO NOTHING`,
    sql`INSERT INTO speaking_turns(team_id,session_id,participant_id,position,name_snapshot,mood,speaking_seconds,budget_seconds,time_up,score,meter_id) SELECT ${id},${round.id},p.id,p.position,p.name,p.mood,p."speakingSeconds",p."budgetSeconds",p."timeUp",p.score,p."meterTitle" FROM ${people} ${fields} WHERE ${gate}`,
    pruneHistoryStatement(id),
    // Clear every team note only for the newly committed completed round.
    // Replays/conflicting rounds cannot erase notes prepared afterwards.
    sql`DELETE FROM participant_daily_hints WHERE team_id=${id} AND ${gate}`,
  ];
}
async function batch(db: Database, statements: SQL[]) {
  const queries = statements.map(statement => db.execute(statement));
  return db.batch(queries as [typeof queries[number], ...typeof queries[number][]]);
}
export async function writeTeam(db: Database, id: string, revision: number, team: TeamState): Promise<number | null> {
  // Separate locking statement gives the next statement a fresh READ COMMITTED
  // snapshot after any concurrent daily selection commits.
  const results = await batch(db, [sql`SELECT id FROM teams WHERE id=${id} FOR UPDATE`, ...teamWriteStatements(id, revision, team)]);
  return results[1].rows.length ? Number(results[1].rows[0].revision) : null;
}
export async function writeHistory(db: Database, id: string, round: HistoryRound) {
  if (mauritiusDay(new Date(round.completedAt)) !== mauritiusDay()) throw new WorkspaceError(400, 'Seul le bilan du jour peut être enregistré.');
  const results = await batch(db, historyWriteStatements(id, round));
  if (results[1].rows.length) return true;
  const existing = await db.execute(sql`SELECT id FROM standup_sessions WHERE team_id=${id} AND id=${round.id}`);
  return existing.rows.length > 0;
}
/** Reset only today's result/check-ins; the durable roster and older history survive. */
export async function resetDailyRound(db: Database, id: string, roundId: string, now = new Date()) {
  const results = await batch(db, [
    sql`SELECT id FROM teams WHERE id=${id} FOR UPDATE`,
    sql`UPDATE teams SET revision=revision+1,write_transaction=txid_current() WHERE id=${id} AND EXISTS(SELECT 1 FROM standup_sessions WHERE team_id=${id} AND id=${roundId} AND (completed_at AT TIME ZONE 'Indian/Mauritius')::date=${mauritiusDay(now)}::date) RETURNING revision`,
    sql`DELETE FROM standup_sessions WHERE team_id=${id} AND (completed_at AT TIME ZONE 'Indian/Mauritius')::date=${mauritiusDay(now)}::date AND ${teamGate(id)}`,
    sql`DELETE FROM participant_check_ins WHERE team_id=${id} AND ${teamGate(id)}`,
  ]);
  return results[1].rows.length > 0;
}
export async function readTeam(db: Database, id: string, now = new Date()) {
  // One statement gives a consistent MVCC snapshot even during concurrent writes.
  const result = await db.execute(sql`SELECT t.revision,jsonb_build_object('duration',t.duration,'warning',t.warning,'sound',t.sound,'session','[]'::jsonb,'currentMoodSlide',NULL,
    'roster',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'present',m.present,'mood',c.mood,'moodUpdatedAt',c.mood_updated_at,'moodSlide',CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('title',mtr.title,'image',s.image,'slideNumber',s.slide_number) || CASE WHEN c.identifier_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('meterId',c.identifier_id) END END) ORDER BY m.position) FROM team_members m JOIN participants p ON p.team_id=m.team_id AND p.id=m.participant_id LEFT JOIN participant_check_ins c ON c.team_id=m.team_id AND c.participant_id=m.participant_id LEFT JOIN mood_meter_slides s ON s.team_id=c.team_id AND s.id=c.slide_id LEFT JOIN mood_meters mtr ON mtr.team_id=s.team_id AND mtr.id=s.meter_id WHERE m.team_id=t.id),'[]'::jsonb),
    'usedMoodMeters',COALESCE((SELECT jsonb_agg(identifier_id ORDER BY position) FROM team_used_mood_meters WHERE team_id=t.id),'[]'::jsonb)) AS team FROM teams t WHERE t.id=${id}`);
  if (!result.rows.length) return { team: null, revision: 0 };
  const team = result.rows[0].team as TeamState;
  const day = mauritiusDay(now);
  team.roster = team.roster.map(person => {
    const timestamp = person.moodUpdatedAt ? new Date(person.moodUpdatedAt) : null;
    if (!timestamp || mauritiusDay(timestamp) !== day) return { ...person, mood: null, moodUpdatedAt: null, moodSlide: null };
    return { ...person, moodUpdatedAt: timestamp.toISOString() };
  });
  return { team, revision: Number(result.rows[0].revision) };
}
export async function readHistory(db: Database, id: string, now = new Date()): Promise<HistoryRound[]> {
  const result = await batch(db, [
    pruneHistoryStatement(id),
    sql`SELECT s.id,s.completed_at AS "completedAt",(SELECT jsonb_agg(jsonb_build_object('id',p.participant_id,'name',p.name_snapshot,'mood',p.mood,'speakingSeconds',p.speaking_seconds,'budgetSeconds',p.budget_seconds,'timeUp',p.time_up,'score',p.score,'meterTitle',m.title) ORDER BY p.position) FROM speaking_turns p LEFT JOIN mood_meters m ON m.team_id=p.team_id AND m.id=p.meter_id WHERE p.team_id=s.team_id AND p.session_id=s.id) AS people FROM standup_sessions s WHERE s.team_id=${id} AND s.completed_at <= ${now.toISOString()}::timestamptz ORDER BY s.completed_at DESC,s.id LIMIT ${HISTORY_LIMIT}`,
  ]);
  return result[1].rows.map(row => ({ id: String(row.id), completedAt: new Date(row.completedAt as string).toISOString(), people: row.people as HistoryRound['people'] }));
}