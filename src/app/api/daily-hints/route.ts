import { NextResponse } from 'next/server';
import { database, databaseFailure, readJson, sameOrigin, selectedTeam } from '@/lib/persistence/database';
import { validateDailyHint } from '@/lib/meeting/daily-hints';
import { readDailyHints, saveDailyHint } from '@/lib/meeting/daily-hints-store';
import { teamReadCache } from '@/lib/persistence/shared-read-cache';
import { WorkspaceError } from '@/lib/team/workspace-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const response = (value: unknown) => NextResponse.json(value, { headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  try {
    const id = await selectedTeam(request);
    // Deliberately uncached: every read observes the server's current day.
    return response(await readDailyHints(database(), id));
  }
  catch (error) { return databaseFailure(error); }
}
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  let input;
  try { input = validateDailyHint(await readJson(request)); }
  catch (error) { return databaseFailure(new WorkspaceError(400, error instanceof Error ? error.message : 'Indice invalide.')); }
  try {
    const id = await selectedTeam(request);
    return response(await teamReadCache.mutate(() => saveDailyHint(database(), id, input)));
  }
  catch (error) { return databaseFailure(error); }
}