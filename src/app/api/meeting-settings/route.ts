import { NextResponse } from 'next/server';
import { database, databaseFailure, readJson, sameOrigin, selectedTeam } from '@/lib/database';
import { validateMeetingSettings } from '@/lib/meeting-settings';
import { readMeetingSettings, saveMeetingSettings } from '@/lib/meeting-store';
import { WorkspaceError } from '@/lib/workspace-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const response = (value: unknown) => NextResponse.json(value, { headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  try { return response(await readMeetingSettings(database(), await selectedTeam(request))); }
  catch (error) { return databaseFailure(error); }
}
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let input;
  try { input = validateMeetingSettings(await readJson(request)); }
  catch (error) { return databaseFailure(new WorkspaceError(400, error instanceof Error ? error.message : 'Questions invalides.')); }
  try { return response(await saveMeetingSettings(database(), await selectedTeam(request), input)); }
  catch (error) { return databaseFailure(error); }
}