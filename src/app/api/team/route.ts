import { NextResponse } from 'next/server';
import { database, selectedTeam, readJson, sameOrigin, databaseFailure } from '@/lib/database';
import { validateTeamRequest } from '@/lib/team-validation';
import { readTeam, writeTeam } from '@/lib/relational-store';
import { readDailyMeter, validateDailyCheckIns } from '@/lib/workspace-store';
import { teamReadCache, teamReadKey } from '@/lib/shared-read-cache';
import { assertJiraRoster } from '@/lib/jira-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const db = database(); const id = await selectedTeam(request);
    return NextResponse.json(await teamReadCache.read(teamReadKey('team', id), 5_000, () => readTeam(db, id)), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return databaseFailure(error); }
}
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let body;
  try { body = validateTeamRequest(await readJson(request)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Équipe invalide.' }, { status: 400 }); }
  try {
    const db = database(); const id = await selectedTeam(request);
    validateDailyCheckIns(body.team, (await readDailyMeter(db, id)).meter);
    await assertJiraRoster(db, id, body.team);
    const revision = await teamReadCache.mutate(() => writeTeam(db, id, body.revision, body.team));
    if (revision === null) return NextResponse.json({ error: 'Équipe modifiée dans un autre onglet. Rechargez avant de synchroniser.' }, { status: 409 });
    return NextResponse.json({ revision });
  } catch (error) { return databaseFailure(error); }
}