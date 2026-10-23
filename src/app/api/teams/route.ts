import { NextResponse } from 'next/server';
import { database, databaseFailure, readJson, sameOrigin } from '@/lib/database';
import { capabilityId, createTeam, deleteTeam, listTeams, selectTeam, strictObject, updateTeamDirectory, validateTeamName, WorkspaceError } from '@/lib/workspace-store';
import { validateTeamCreation, validateTeamDirectoryPatch, type TeamCategory, type TeamDirectoryPatch } from '@/lib/team-directory';
import { teamReadCache, teamReadKey } from '@/lib/shared-read-cache';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const response = (value: unknown) => NextResponse.json(value, { headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  try { return response(await teamReadCache.read(teamReadKey('teams'), 5_000, () => listTeams(database()))); }
  catch (error) { return databaseFailure(error); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let name: string;
  let category: TeamCategory | null;
  try {
    const input = validateTeamCreation(await readJson(request));
    name = validateTeamName(input.name); category = input.category;
  }
  catch (error) { return databaseFailure(error instanceof WorkspaceError ? error : new WorkspaceError(400, 'Requête invalide.')); }
  try { return response(await teamReadCache.mutate(() => createTeam(database(), name, category))); }
  catch (error) { return databaseFailure(error); }
}
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let input: TeamDirectoryPatch;
  try {
    input = validateTeamDirectoryPatch(await readJson(request));
  } catch (error) { return databaseFailure(error instanceof WorkspaceError ? error : new WorkspaceError(400, 'Requête invalide.')); }
  try {
    if ('category' in input || 'favorite' in input) return response(await teamReadCache.mutate(() => updateTeamDirectory(database(), input)));
    return response(await selectTeam(database(), input.teamId));
  }
  catch (error) { return databaseFailure(error); }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let input: Record<string, unknown>;
  try {
    input = strictObject(await readJson(request), ['teamId', 'name']);
    if (!capabilityId(input.teamId)) throw new WorkspaceError(400, 'Équipe invalide.');
    validateTeamName(input.name);
  } catch (error) { return databaseFailure(error instanceof WorkspaceError ? error : new WorkspaceError(400, 'Requête invalide.')); }
  try { return response(await teamReadCache.mutate(() => deleteTeam(database(), input))); }
  catch (error) { return databaseFailure(error); }
}