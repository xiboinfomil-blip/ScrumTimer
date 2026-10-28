import { NextResponse } from 'next/server';
import { selectedTeam, sameOrigin, readJson, databaseFailure } from '@/lib/persistence/database';
import { validateLiveSnapshot } from '@/lib/live/live-session';
import { liveTransport, publishLive, readLive, stopLive } from '@/lib/live/live-session-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  try { const team = await selectedTeam(request); return NextResponse.json({ snapshot: await readLive(team), serverNow: Date.now(), transport: liveTransport() }, { headers }); }
  catch (error) { return databaseFailure(error); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let snapshot; let owner;
  try {
    const body = await readJson(request);
    snapshot = validateLiveSnapshot(body.snapshot);
    // The publisher and spectators can have different wall clocks.
    // Convert its measured remaining time to the server clock at receipt.
    snapshot = { ...snapshot, deadline: snapshot.running ? Date.now() + snapshot.remaining * 1000 : 0 };
    owner = body.owner ?? null;
    if (owner !== null && (typeof owner !== 'string' || !/^[\w-]{36}$/.test(owner))) throw new Error();
  } catch { return NextResponse.json({ error: 'Diffusion invalide.' }, { status: 400, headers }); }
  try {
    const team = await selectedTeam(request);
    const token = await publishLive(team, owner, snapshot);
    return token ? NextResponse.json({ owner: token, transport: liveTransport() }, { headers }) : NextResponse.json({ error: 'Une autre personne diffuse déjà pour cette équipe.' }, { status: 409, headers });
  } catch (error) { return databaseFailure(error); }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  let owner;
  try { owner = (await readJson(request)).owner; if (typeof owner !== 'string' || !/^[\w-]{36}$/.test(owner)) throw new Error(); }
  catch { return NextResponse.json({ error: 'Diffusion invalide.' }, { status: 400, headers }); }
  try { await stopLive(await selectedTeam(request), owner); return NextResponse.json({ stopped: true }, { headers }); }
  catch (error) { return databaseFailure(error); }
}