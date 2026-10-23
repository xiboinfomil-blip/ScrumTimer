/** Node-only capability derivation; no storage, environment reads or server-only test condition. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { RemoteError } from './timer-remote.ts';

const domain = 'standup:timer-remote:control:v1:';
const shape = /^[A-Za-z0-9_-]{43}$/;

export function timerRemoteSecret(env: Readonly<Record<string, string | undefined>>): string {
  const secret = env.TIMER_REMOTE_SECRET ?? env.PARTICIPANT_PORTAL_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) throw new RemoteError(503, 'REMOTE_SECRET_INVALID');
  return secret;
}

export function timerRemoteTeamId(id: string): string {
  if (!shape.test(id)) throw new RemoteError(401);
  const bytes = Buffer.from(id, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== id) throw new RemoteError(401);
  return bytes.toString('hex');
}

export function timerRemoteAccess(teamId: string, secret: string) {
  if (!/^[a-f0-9]{64}$/.test(teamId)) throw new RemoteError(400);
  timerRemoteSecret({ TIMER_REMOTE_SECRET: secret });
  const id = Buffer.from(teamId, 'hex').toString('base64url');
  const control = createHmac('sha256', secret).update(domain + id).digest('base64url');
  return { id, control };
}

export function authorizeTimerRemoteControl(id: string, control: string, secret: string): string {
  const teamId = timerRemoteTeamId(id);
  const expected = timerRemoteAccess(teamId, secret).control;
  if (!shape.test(control)) throw new RemoteError(401);
  // Compare the canonical text as bytes: noncanonical base64 aliases are not capabilities.
  if (!timingSafeEqual(Buffer.from(control, 'ascii'), Buffer.from(expected, 'ascii'))) throw new RemoteError(401);
  return teamId;
}