import { NextResponse } from 'next/server';
import { database, privateSpace, readJson, sameOrigin, unavailable } from '@/lib/database';
import { normalizeTeam } from '@/lib/team-storage';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const sql = await database(); const id = await privateSpace();
    const rows = await sql`SELECT team, revision FROM standup_spaces WHERE id = ${id}`;
    return NextResponse.json({ team: rows[0]?.team ?? null, revision: rows[0]?.revision ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return unavailable(); }
}
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let body;
  try { body = await readJson(request); if (!body?.team || !Number.isInteger(body.revision) || body.revision < 0) throw new Error(); }
  catch { return new NextResponse(null, { status: 400 }); }
  try {
    const sql = await database(); const id = await privateSpace();
    const team = normalizeTeam(body.team);
    // Save profiles/preferences, never live countdowns or speaking progress.
    const saved = { ...team, session: [], currentMoodSlide: null };
    const rows = body.revision === 0
      ? await sql`INSERT INTO standup_spaces(id, team) VALUES (${id}, ${JSON.stringify(saved)}::jsonb) ON CONFLICT DO NOTHING RETURNING revision`
      : await sql`UPDATE standup_spaces SET team = ${JSON.stringify(saved)}::jsonb, revision = revision + 1, updated_at = now() WHERE id = ${id} AND revision = ${body.revision} RETURNING revision`;
    if (!rows.length) return NextResponse.json({ error: 'Équipe modifiée dans un autre onglet. Rechargez avant de synchroniser.' }, { status: 409 });
    return NextResponse.json({ revision: rows[0].revision });
  } catch { return unavailable(); }
}