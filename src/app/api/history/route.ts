import { NextResponse } from 'next/server';
import { database, privateSpace, readJson, sameOrigin, unavailable } from '@/lib/database';
import { historyCutoff, normalizeHistory } from '@/lib/history';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const sql = await database(); const id = await privateSpace();
    await sql`DELETE FROM standup_rounds WHERE completed_at < ${historyCutoff().toISOString()}`;
    const rows = await sql`SELECT result FROM standup_rounds WHERE space_id = ${id} AND completed_at >= ${historyCutoff().toISOString()} ORDER BY completed_at DESC`;
    return NextResponse.json({ rounds: normalizeHistory(rows.map(row => row.result)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return unavailable(); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let rounds;
  try { rounds = normalizeHistory([await readJson(request)]); if (!rounds.length) throw new Error(); }
  catch { return new NextResponse(null, { status: 400 }); }
  try {
    const sql = await database(); const id = await privateSpace(); const round = rounds[0];
    // Team bootstrap must precede history writes; never create an empty team over a saved one.
    const spaces = await sql`SELECT id FROM standup_spaces WHERE id = ${id}`;
    if (!spaces.length) return new NextResponse(null, { status: 409 });
    await sql`INSERT INTO standup_rounds(space_id, id, completed_at, result) VALUES (${id}, ${round.id}, ${round.completedAt}, ${JSON.stringify(round)}::jsonb) ON CONFLICT DO NOTHING`;
    await sql`DELETE FROM standup_rounds WHERE completed_at < ${historyCutoff().toISOString()}`;
    return NextResponse.json({ saved: true });
  } catch { return unavailable(); }
}