import { NextResponse } from 'next/server';
import { database, databaseFailure, readJson, sameOrigin, selectedTeam } from '@/lib/database';
import { changeDailyMeter, readDailyMeter, saveDailyMeter, validateDailyMeter, WorkspaceError } from '@/lib/workspace-store';
import { teamReadCache, teamReadKey } from '@/lib/shared-read-cache';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const response = (value: unknown) => NextResponse.json(value, { headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  try {
    const id = await selectedTeam(request);
    return response(await teamReadCache.read(teamReadKey('daily-meter', id), 5_000, () => readDailyMeter(database(), id)));
  }
  catch (error) { return databaseFailure(error); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let meter;
  try { meter = validateDailyMeter(await readJson(request)); }
  catch (error) { return databaseFailure(error instanceof WorkspaceError ? error : new WorkspaceError(400, 'Baromètre invalide.')); }
  try {
    const id = await selectedTeam(request);
    return response(await teamReadCache.mutate(() => saveDailyMeter(database(), id, meter)));
  }
  catch (error) { return databaseFailure(error); }
}
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let meter;
  try { meter = validateDailyMeter(await readJson(request)); }
  catch (error) { return databaseFailure(error instanceof WorkspaceError ? error : new WorkspaceError(400, 'Baromètre invalide.')); }
  try {
    const id = await selectedTeam(request);
    return response(await teamReadCache.mutate(() => changeDailyMeter(database(), id, meter)));
  }
  catch (error) { return databaseFailure(error); }
}