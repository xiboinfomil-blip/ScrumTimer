import { NextResponse } from 'next/server';
import { database, privateSpace, readJson, sameOrigin, unavailable } from '@/lib/database';
import { historyCutoff, normalizeHistory } from '@/lib/history';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { rounds as historyRounds, spaces } from '@/db/schema';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const db = database(); const id = await privateSpace();
    await db.delete(historyRounds).where(lt(historyRounds.completedAt, historyCutoff()));
    const rows = await db.select({ result: historyRounds.result }).from(historyRounds).where(and(eq(historyRounds.spaceId, id), gte(historyRounds.completedAt, historyCutoff()))).orderBy(desc(historyRounds.completedAt));
    return NextResponse.json({ rounds: normalizeHistory(rows.map(row => row.result)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return unavailable(); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let rounds;
  try { rounds = normalizeHistory([await readJson(request)]); if (!rounds.length) throw new Error(); }
  catch { return new NextResponse(null, { status: 400 }); }
  try {
    const db = database(); const id = await privateSpace(); const round = rounds[0];
    // Team bootstrap must precede history writes; never create an empty team over a saved one.
    const existing = await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, id));
    if (!existing.length) return new NextResponse(null, { status: 409 });
    await db.insert(historyRounds).values({ spaceId: id, id: round.id, completedAt: new Date(round.completedAt), result: round }).onConflictDoNothing();
    await db.delete(historyRounds).where(lt(historyRounds.completedAt, historyCutoff()));
    return NextResponse.json({ saved: true });
  } catch { return unavailable(); }
}