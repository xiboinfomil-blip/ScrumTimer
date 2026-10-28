import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { database, databaseFailure, readJson } from '@/lib/persistence/database';
import { readDailyHints, saveDailyHint } from '@/lib/meeting/daily-hints-store';
import { validateDailyHint } from '@/lib/meeting/daily-hints';
import { equalPortalSecret, readParticipantLinkToken, validPortalSecret } from '@/lib/participants/participant-access';
import { readHistory } from '@/lib/persistence/relational-store';
import { teamReadCache } from '@/lib/persistence/shared-read-cache';
import { WorkspaceError } from '@/lib/team/workspace-store';
import { jiraTeamSprint } from '@/lib/jira/jira-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const response = (data: unknown) => NextResponse.json(data, { headers });
function authorizedTeam(request: Request) {
  const secret = process.env.PARTICIPANT_PORTAL_SECRET;
  if (!validPortalSecret(secret)) throw new WorkspaceError(503, 'Portail participants indisponible.');
  if (!equalPortalSecret(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) throw new WorkspaceError(403, 'Lien d’équipe invalide.');
  const teamId = readParticipantLinkToken(request.headers.get('X-Team-Link'), secret);
  if (!teamId) throw new WorkspaceError(403, 'Lien d’équipe invalide.');
  return teamId;
}
export async function GET(request: Request) {
  try {
    const id = authorizedTeam(request), db = database();
    if (await jiraTeamSprint(db, id)) throw new WorkspaceError(403, 'Cette équipe de sprint nécessite une connexion Jira sur l’application principale.');
    const team = await db.execute(sql`SELECT t.id,t.name,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'present',m.present) ORDER BY m.position) FROM team_members m JOIN participants p ON p.team_id=m.team_id AND p.id=m.participant_id WHERE m.team_id=t.id),'[]'::jsonb) AS roster FROM teams t WHERE t.id=${id}`);
    if (!team.rows.length) throw new WorkspaceError(403, 'Lien d’équipe invalide.');
    const [notes, history] = await Promise.all([readDailyHints(db, id), readHistory(db, id)]);
    return response({ team: team.rows[0], ...notes, history });
  } catch (error) { return databaseFailure(error); }
}
export async function PUT(request: Request) {
  try {
    const id = authorizedTeam(request);
    if (await jiraTeamSprint(database(), id)) throw new WorkspaceError(403, 'Cette équipe de sprint nécessite une connexion Jira sur l’application principale.');
    let input;
    try { input = validateDailyHint(await readJson(request)); }
    catch (error) { throw new WorkspaceError(400, error instanceof Error ? error.message : 'Note invalide.'); }
    return response(await teamReadCache.mutate(() => saveDailyHint(database(), id, input)));
  } catch (error) { return databaseFailure(error); }
}