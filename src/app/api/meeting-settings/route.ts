import { NextResponse } from 'next/server';
import { database, databaseFailure, readJson, sameOrigin, selectedTeam } from '@/lib/persistence/database';
import { validateMeetingSettings } from '@/lib/meeting/meeting-settings';
import { readMeetingSettings, saveMeetingSettings } from '@/lib/meeting/meeting-store';
import { WorkspaceError } from '@/lib/team/workspace-store';
import { teamReadCache, teamReadKey } from '@/lib/persistence/shared-read-cache';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const response = (value: unknown) => NextResponse.json(value, { headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  try {
    const id = await selectedTeam(request);
    return response(await teamReadCache.read(teamReadKey('meeting-settings', id), 5_000, () => readMeetingSettings(database(), id)));
  }
  catch (error) { return databaseFailure(error); }
}
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let input;
  try { input = validateMeetingSettings(await readJson(request)); }
  catch (error) { return databaseFailure(new WorkspaceError(400, error instanceof Error ? error.message : 'Questions invalides.')); }
  try {
    const id = await selectedTeam(request);
    return response(await teamReadCache.mutate(() => saveMeetingSettings(database(), id, input)));
  }
  catch (error) { return databaseFailure(error); }
}