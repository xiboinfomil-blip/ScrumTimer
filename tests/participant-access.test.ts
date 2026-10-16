import assert from 'node:assert/strict';
import test from 'node:test';
import { createParticipantLinkToken, readParticipantLinkToken, validPortalSecret, equalPortalSecret } from '../src/lib/participant-access.ts';

const secret = 'a-test-secret-with-at-least-32-bytes', team = 'a'.repeat(64);
test('participant links are signed and scoped to exactly one team', () => {
  const token = createParticipantLinkToken(team, secret);
  assert.equal(readParticipantLinkToken(token, secret), team);
  assert.notEqual(token, createParticipantLinkToken('b'.repeat(64), secret));
  assert.equal(readParticipantLinkToken(token, `${secret}-rotated`), null);
  assert.equal(readParticipantLinkToken(`${token}x`, secret), null);
  const forged = Buffer.from(JSON.stringify({ v: 1, teamId: 'b'.repeat(64) })).toString('base64url');
  assert.equal(readParticipantLinkToken(`${forged}.${token.split('.')[1]}`, secret), null);
});
test('portal fails closed for missing, malformed and weak credentials', () => {
  for (const value of [null, '', 'a', 'a.b.c', 'a.=', 'a'.repeat(513)]) assert.equal(readParticipantLinkToken(value, secret), null);
  assert.equal(validPortalSecret(undefined), false);
  assert.equal(validPortalSecret('short'), false);
  assert.throws(() => createParticipantLinkToken(team, 'short'));
  assert.throws(() => createParticipantLinkToken('../other', secret));
  assert.equal(equalPortalSecret(secret, secret), true);
  assert.equal(equalPortalSecret(secret, 'other'), false);
});