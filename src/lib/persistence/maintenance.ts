import { createHash, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { mauritiusDay } from '@infomil/scrum-shared/statistics';
import { pruneHistoryStatement } from '../history/retention.ts';

export function authorizedMaintenance(request: Request, secret: string | undefined) {
  if (!secret || secret.length < 32 || /\s/.test(secret)) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(request.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`));
}

export function maintenanceDeletes(now = new Date()) {
  const day = mauritiusDay(now);
  return [
    { resource: 'history', statement: pruneHistoryStatement() },
    { resource: 'notes', statement: sql`DELETE FROM participant_daily_hints WHERE day < ${day}::date` },
    { resource: 'dailyMeters', statement: sql`DELETE FROM team_daily_meters WHERE day < ${day}::date` },
    { resource: 'checkIns', statement: sql`DELETE FROM participant_check_ins WHERE mood_updated_at < (${day}::date::timestamp AT TIME ZONE 'Indian/Mauritius')` },
    { resource: 'oauthStates', statement: sql`DELETE FROM jira_oauth_states WHERE expires_at <= ${now.toISOString()}::timestamptz` },
    { resource: 'jiraSessions', statement: sql`DELETE FROM jira_sessions WHERE expires_at <= ${now.toISOString()}::timestamptz` },
    { resource: 'slides', statement: sql`DELETE FROM mood_meter_slides s WHERE NOT EXISTS(SELECT 1 FROM participant_check_ins c WHERE c.team_id=s.team_id AND c.slide_id=s.id)` },
    { resource: 'meters', statement: sql`DELETE FROM mood_meters m WHERE NOT EXISTS(SELECT 1 FROM mood_meter_slides s WHERE s.team_id=m.team_id AND s.meter_id=m.id) AND NOT EXISTS(SELECT 1 FROM speaking_turns t WHERE t.team_id=m.team_id AND t.meter_id=m.id)` },
    { resource: 'identifiers', statement: sql`DELETE FROM mood_meter_identifiers i WHERE NOT EXISTS(SELECT 1 FROM participant_check_ins c WHERE c.team_id=i.team_id AND c.identifier_id=i.id) AND NOT EXISTS(SELECT 1 FROM team_daily_meters d WHERE d.team_id=i.team_id AND d.meter_id=i.id) AND NOT EXISTS(SELECT 1 FROM team_used_mood_meters u WHERE u.team_id=i.team_id AND u.identifier_id=i.id)` },
    { resource: 'participants', statement: sql`DELETE FROM participants p WHERE NOT EXISTS(SELECT 1 FROM team_members m WHERE m.team_id=p.team_id AND m.participant_id=p.id) AND NOT EXISTS(SELECT 1 FROM speaking_turns t WHERE t.team_id=p.team_id AND t.participant_id=p.id) AND NOT EXISTS(SELECT 1 FROM participant_daily_hints h WHERE h.team_id=p.team_id AND h.participant_id=p.id)` },
  ];
}

export async function maintainDatabase(db: Pick<NeonHttpDatabase, 'execute' | 'batch'>, now = new Date()) {
  const deletes = maintenanceDeletes(now);
  const statements = [
    sql`SET LOCAL lock_timeout = '5s'`,
    sql`SET LOCAL statement_timeout = '20s'`,
    sql`SELECT pg_advisory_xact_lock(20501028)`,
    sql`SELECT id FROM teams ORDER BY id FOR UPDATE`,
    ...deletes.map(({ statement }) => sql`WITH deleted AS (${statement} RETURNING 1) SELECT count(*)::int AS deleted FROM deleted`),
  ];
  const queries = statements.map(statement => db.execute(statement));
  const results = await db.batch(queries as [typeof queries[number], ...typeof queries[number][]]);
  return Object.fromEntries(deletes.map(({ resource }, index) => [resource, Number(results[index + 4].rows[0].deleted)]));
}