import { NextResponse } from 'next/server';
import { database, selectedTeam, readJson, sameOrigin, databaseFailure } from '@/lib/persistence/database';
import { validateHistoryInput } from '@/lib/team/team-validation';
import { readHistory, resetDailyRound, writeHistory } from '@/lib/persistence/relational-store';
import { mauritiusDay, strictObject } from '@/lib/team/workspace-store';
import { teamReadCache, teamReadKey } from '@/lib/persistence/shared-read-cache';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const db = database(); const id = await selectedTeam(request);
    return NextResponse.json({ rounds: await teamReadCache.read(teamReadKey('history', id), 5_000, () => readHistory(db, id)), day: mauritiusDay() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return databaseFailure(error); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let round;
  try { round = validateHistoryInput(await readJson(request)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Bilan invalide.' }, { status: 400 }); }
  try {
    const db = database(); const id = await selectedTeam(request);
    // Team bootstrap must precede history writes; never create an empty team over a saved one.
    if (!await teamReadCache.mutate(() => writeHistory(db, id, round))) return NextResponse.json({ error: 'Le point quotidien est déjà terminé aujourd’hui.' }, { status: 409 });
    return NextResponse.json({ saved: true });
  } catch (error) { return databaseFailure(error); }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let roundId: unknown;
  try {
    roundId = strictObject(await readJson(request), ['roundId']).roundId;
    if (typeof roundId !== 'string' || !/^[\w-]{1,100}$/.test(roundId)) throw new Error();
  } catch { return NextResponse.json({ error: 'Bilan invalide.' }, { status: 400 }); }
  try {
    const db = database(); const id = await selectedTeam(request);
    if (!await teamReadCache.mutate(() => resetDailyRound(db, id, roundId as string))) return NextResponse.json({ error: 'Le bilan a changé. Rechargez la page.' }, { status: 409 });
    return NextResponse.json({ reset: true });
  } catch (error) { return databaseFailure(error); }
}