import { sql } from 'drizzle-orm';
import { HISTORY_LIMIT } from '@infomil/scrum-shared/statistics';

export function pruneHistoryStatement(teamId?: string) {
  return sql`DELETE FROM standup_sessions s USING (
    SELECT team_id,id,row_number() OVER (PARTITION BY team_id ORDER BY completed_at DESC,id ASC) AS position
    FROM standup_sessions WHERE ${teamId === undefined ? sql`true` : sql`team_id=${teamId}`}
  ) ranked WHERE s.team_id=ranked.team_id AND s.id=ranked.id AND ranked.position > ${HISTORY_LIMIT}`;
}