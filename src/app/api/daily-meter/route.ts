import { NextResponse } from 'next/server';
import { database, databaseFailure, readJson, sameOrigin, selectedTeam } from '@/lib/database';
import { readDailyMeter, saveDailyMeter, validateDailyMeter, WorkspaceError } from '@/lib/workspace-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const response = (value: unknown) => NextResponse.json(value, { headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  try { return response(await readDailyMeter(database(), await selectedTeam(request))); }
  catch (error) { return databaseFailure(error); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let meter;
  try { meter = validateDailyMeter(await readJson(request)); }
  catch (error) { return databaseFailure(error instanceof WorkspaceError ? error : new WorkspaceError(400, 'Baromètre invalide.')); }
  try { return response(await saveDailyMeter(database(), await selectedTeam(request), meter)); }
  catch (error) { return databaseFailure(error); }
}