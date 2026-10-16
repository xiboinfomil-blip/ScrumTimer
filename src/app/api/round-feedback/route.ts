import { NextResponse } from 'next/server';
import { database, databaseFailure, readJson, sameOrigin, selectedTeam } from '@/lib/database';
import { validateRoundFeedback, validateRoundId } from '@/lib/meeting-settings';
import { readRoundFeedback, saveRoundFeedback } from '@/lib/meeting-store';
import { WorkspaceError } from '@/lib/workspace-store';
import { teamReadCache, teamReadKey } from '@/lib/shared-read-cache';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const response = (value: unknown) => NextResponse.json(value, { headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  let roundId;
  try { roundId = validateRoundId(new URL(request.url).searchParams.get('roundId')); }
  catch { return databaseFailure(new WorkspaceError(400, 'Bilan invalide.')); }
  try {
    const id = await selectedTeam(request);
    return response(await teamReadCache.read(teamReadKey(`feedback:${roundId}`, id), 5_000, () => readRoundFeedback(database(), id, roundId)));
  }
  catch (error) { return databaseFailure(error); }
}
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let input;
  try { input = validateRoundFeedback(await readJson(request)); }
  catch (error) { return databaseFailure(new WorkspaceError(400, error instanceof Error ? error.message : 'Retour invalide.')); }
  try {
    const id = await selectedTeam(request);
    return response(await teamReadCache.mutate(() => saveRoundFeedback(database(), id, input)));
  }
  catch (error) { return databaseFailure(error); }
}