import { createHmac, timingSafeEqual } from 'node:crypto';

const teamPattern = /^[a-f0-9]{64}$/;
export function validPortalSecret(secret: string | undefined): secret is string {
  return typeof secret === 'string' && Buffer.byteLength(secret, 'utf8') >= 32;
}
export function equalPortalSecret(value: string, expected: string) {
  const a = Buffer.from(value), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createParticipantLinkToken(teamId: string, secret: string) {
  if (!teamPattern.test(teamId) || !validPortalSecret(secret)) throw new Error('Configuration du portail invalide.');
  const payload = Buffer.from(JSON.stringify({ v: 1, teamId })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function readParticipantLinkToken(token: string | null, secret: string): string | null {
  if (!validPortalSecret(secret) || !token || token.length > 512) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  const [payload, signature] = parts;
  if (!equalPortalSecret(signature, createHmac('sha256', secret).update(payload).digest('base64url'))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data && data.v === 1 && typeof data.teamId === 'string' && teamPattern.test(data.teamId)
      && Object.keys(data).length === 2 ? data.teamId : null;
  } catch { return null; }
}