import 'server-only';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/db/schema';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { configureNeonNetwork } from './neon-network';
import { resolveSelectedTeam, WorkspaceError } from './workspace-store';

let connection: ReturnType<typeof createDatabase> | undefined;
function createDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('database unavailable');
  configureNeonNetwork(process.env.DATABASE_URL);
  return drizzle(neon(process.env.DATABASE_URL), { schema });
}
export function database() {
  connection ??= createDatabase();
  return connection;
}
export async function privateSpace() {
  const store = await cookies();
  const existing = store.get('standup-space')?.value;
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const id = randomBytes(32).toString('hex');
  store.set('standup-space', id, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return id;
}
export function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}
export async function selectedTeam(request: Request) {
  return resolveSelectedTeam(database(), await privateSpace(), request.headers.get('X-Team-Id'));
}
export function databaseFailure(error: unknown) {
  if (error instanceof WorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
  let cause: unknown = error;
  for (let depth = 0; cause && depth < 5; depth++) {
    const current = cause as { code?: string; cause?: unknown; sourceError?: unknown };
    if (current.code === '23505') return NextResponse.json({ error: 'Une équipe porte déjà ce nom.' }, { status: 409 });
    cause = current.cause ?? current.sourceError;
  }
  return unavailable();
}
export function unavailable() {
  return NextResponse.json({ error: 'Neon indisponible. Aucune sauvegarde locale.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
export async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new Error('invalid content type');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('empty body');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 256_000) { await reader.cancel(); throw new Error('body too large'); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}