import { NextResponse } from 'next/server';
import { database, selectedTeam, readJson, sameOrigin, databaseFailure } from '@/lib/database';
import { validateHistoryInput } from '@/lib/team-validation';
import { readHistory, writeHistory } from '@/lib/relational-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const db = database(); const id = await selectedTeam(request);
    return NextResponse.json({ rounds: await readHistory(db, id) }, { headers: { 'Cache-Control': 'no-store' } });
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
    if (!await writeHistory(db, id, round)) return new NextResponse(null, { status: 409 });
    return NextResponse.json({ saved: true });
  } catch (error) { return databaseFailure(error); }
}