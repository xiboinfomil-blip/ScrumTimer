import { NextResponse } from 'next/server';
import { database, databaseFailure, sameOrigin, selectedTeam } from '@/lib/database';
import { jiraTeamSprint } from '@/lib/jira-store';
import { WorkspaceError } from '@/lib/workspace-store';
import { createParticipantLinkToken, validPortalSecret } from '@/lib/participant-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403, headers });
  const secret = process.env.PARTICIPANT_PORTAL_SECRET;
  let base: URL;
  try {
    base = new URL(process.env.PARTICIPANT_PORTAL_URL ?? '');
    if (base.username || base.password || base.pathname !== '/' || base.search || base.hash
      || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)))) throw new Error();
  } catch { return NextResponse.json({ error: 'Configurez PARTICIPANT_PORTAL_URL pour partager le portail.' }, { status: 503, headers }); }
  if (!validPortalSecret(secret)) return NextResponse.json({ error: 'Configurez un PARTICIPANT_PORTAL_SECRET partagé d’au moins 32 octets.' }, { status: 503, headers });
  try {
    const id = await selectedTeam(request);
    if (await jiraTeamSprint(database(), id)) throw new WorkspaceError(403, 'Cette équipe de sprint nécessite une connexion Jira sur l’application principale.');
    return NextResponse.json({ url: new URL(`/t/${createParticipantLinkToken(id, secret)}`, base).href }, { headers });
  } catch (error) { return databaseFailure(error); }
}