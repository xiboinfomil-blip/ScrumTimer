import { NextResponse } from 'next/server';
import { database, privateSpace, readJson, sameOrigin, unavailable } from '@/lib/database';
import { normalizeTeam } from '@/lib/team-storage';
import { and, eq, sql } from 'drizzle-orm';
import { spaces } from '@/db/schema';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const db = database(); const id = await privateSpace();
    const rows = await db.select({ team: spaces.team, revision: spaces.revision }).from(spaces).where(eq(spaces.id, id));
    return NextResponse.json({ team: rows[0]?.team ?? null, revision: rows[0]?.revision ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return unavailable(); }
}
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let body;
  try { body = await readJson(request); if (!body?.team || !Number.isInteger(body.revision) || body.revision < 0) throw new Error(); }
  catch { return new NextResponse(null, { status: 400 }); }
  try {
    const db = database(); const id = await privateSpace();
    const team = normalizeTeam(body.team);
    // Save profiles/preferences, never live countdowns or speaking progress.
    const saved = { ...team, session: [], currentMoodSlide: null };
    const rows = body.revision === 0
      ? await db.insert(spaces).values({ id, team: saved }).onConflictDoNothing().returning({ revision: spaces.revision })
      : await db.update(spaces).set({ team: saved, revision: sql`${spaces.revision} + 1`, updatedAt: new Date() }).where(and(eq(spaces.id, id), eq(spaces.revision, body.revision))).returning({ revision: spaces.revision });
    if (!rows.length) return NextResponse.json({ error: 'Équipe modifiée dans un autre onglet. Rechargez avant de synchroniser.' }, { status: 409 });
    return NextResponse.json({ revision: rows[0].revision });
  } catch { return unavailable(); }
}