import { NextResponse } from 'next/server';
import { readJson, sameOrigin, selectedTeam } from '@/lib/database';
import {
  RemoteError, REMOTE_MAX_BODY_BYTES, remoteBearer, remoteObject, validateRemoteId, validateRemotePost,
} from '@/lib/timer-remote';
import { commandTimerRemote, createTimerRemote, readTimerRemote, revokeTimerRemote, syncTimerRemote } from '@/lib/timer-remote-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const json = (body: unknown, status = 200, startedAt?: number) => NextResponse.json(body, {
  status,
  headers: {
    ...headers,
    ...(startedAt === undefined ? {} : { 'Server-Timing': `remote;dur=${(performance.now() - startedAt).toFixed(2)}` }),
  },
});

function failure(error: unknown, startedAt?: number) {
  const status = error instanceof RemoteError ? error.status : 503;
  return json({ error: 'Télécommande indisponible.', ...(error instanceof RemoteError && error.code ? { code: error.code } : {}) }, status, startedAt);
}

/** Keep the existing JSON parser, but cap the actual stream (including whitespace) at 8 KiB. */
async function smallJson(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > REMOTE_MAX_BODY_BYTES)) throw new RemoteError(400);
  const reader = request.body?.getReader();
  if (!reader) throw new RemoteError(400);
  let size = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) { controller.close(); return; }
      size += value.byteLength;
      if (size > REMOTE_MAX_BODY_BYTES) {
        await reader.cancel();
        controller.error(new RemoteError(400));
      } else controller.enqueue(value);
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  try {
    return await readJson(new Request(request.url, {
      method: request.method, headers: request.headers, signal: request.signal, body, duplex: 'half',
    } as RequestInit & { duplex: 'half' }));
  } catch { throw new RemoteError(400); }
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  try {
    const token = remoteBearer(request.headers.get('authorization'));
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some(key => key !== 'id') || query.getAll('id').length !== 1) throw new RemoteError(400);
    return json(await readTimerRemote(validateRemoteId(query.get('id')), token), 200, startedAt);
  } catch (error) { return failure(error, startedAt); }
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  if (!sameOrigin(request)) return json({ error: 'Télécommande indisponible.' }, 403, startedAt);
  try {
    const body = validateRemotePost(await smallJson(request));
    if (body.operation === 'create') {
      // This is the only database interaction: resolve the existing selected team, never persist timer data.
      return json(await createTimerRemote(await selectedTeam(request)), 201, startedAt);
    }
    const token = remoteBearer(request.headers.get('authorization'));
    if (body.operation === 'sync') return json(await syncTimerRemote(body.id, token, body.snapshot, body.ack), 200, startedAt);
    return json(await commandTimerRemote(body.id, token, body.command), 200, startedAt);
  } catch (error) { return failure(error, startedAt); }
}

export async function DELETE(request: Request) {
  const startedAt = performance.now();
  if (!sameOrigin(request)) return json({ error: 'Télécommande indisponible.' }, 403, startedAt);
  try {
    const token = remoteBearer(request.headers.get('authorization'));
    const body = remoteObject(await smallJson(request), ['id']);
    return json(await revokeTimerRemote(validateRemoteId(body.id), token), 200, startedAt);
  } catch (error) { return failure(error, startedAt); }
}