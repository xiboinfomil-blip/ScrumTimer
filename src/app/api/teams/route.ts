import { NextResponse } from 'next/server';
import { database, databaseFailure, privateSpace, readJson, sameOrigin } from '@/lib/database';
import { capabilityId, createTeam, listTeams, selectTeam, strictObject, validateTeamName, WorkspaceError } from '@/lib/workspace-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const response = (value: unknown) => NextResponse.json(value, { headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  try { return response(await listTeams(database(), await privateSpace())); }
  catch (error) { return databaseFailure(error); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let name: string;
  try { name = validateTeamName(strictObject(await readJson(request), ['name']).name); }
  catch (error) { return databaseFailure(error instanceof WorkspaceError ? error : new WorkspaceError(400, 'Requête invalide.')); }
  try { return response(await createTeam(database(), await privateSpace(), name)); }
  catch (error) { return databaseFailure(error); }
}
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let teamId: unknown;
  try {
    teamId = strictObject(await readJson(request), ['teamId']).teamId;
    if (!capabilityId(teamId)) throw new WorkspaceError(400, 'Équipe invalide.');
  } catch (error) { return databaseFailure(error instanceof WorkspaceError ? error : new WorkspaceError(400, 'Requête invalide.')); }
  try { return response(await selectTeam(database(), await privateSpace(), teamId)); }
  catch (error) { return databaseFailure(error); }
}