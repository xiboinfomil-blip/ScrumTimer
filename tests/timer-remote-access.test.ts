import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { authorizeTimerRemoteControl, timerRemoteAccess, timerRemoteSecret, timerRemoteTeamId } from '../src/lib/remote/timer-remote-access.ts';
import { RemoteError } from '../src/lib/remote/timer-remote.ts';

const secret = 'timer-remote-test-only-secret-32-bytes-minimum';
const team = 'ab'.repeat(32);
const rejects = (fn: () => unknown, status: number) => assert.throws(fn, error => error instanceof RemoteError && error.status === status);

test('stable canonical team id and domain-separated HMAC survive independent derivations', () => {
  const access = timerRemoteAccess(team, secret);
  assert.equal(access.id, Buffer.from(team, 'hex').toString('base64url'));
  assert.equal(access.id.length, 43);
  assert.equal(access.control.length, 43);
  assert.equal(access.control, createHmac('sha256', secret).update('standup:timer-remote:control:v1:' + access.id).digest('base64url'));
  assert.deepEqual(timerRemoteAccess(team, secret), access);
  assert.equal(timerRemoteTeamId(access.id), team);
  assert.equal(authorizeTimerRemoteControl(access.id, access.control, secret), team);
  assert.notEqual(timerRemoteAccess('cd'.repeat(32), secret).control, access.control);
  rejects(() => authorizeTimerRemoteControl(access.id, access.control, secret + '-rotated'), 401);
  rejects(() => authorizeTimerRemoteControl(timerRemoteAccess('cd'.repeat(32), secret).id, access.control, secret), 401);
});

test('access rejects malformed teams, noncanonical ids and altered controls', () => {
  for (const teamId of ['team-a', 'a'.repeat(63), 'A'.repeat(64), 'g'.repeat(64), 'a'.repeat(65)]) {
    rejects(() => timerRemoteAccess(teamId, secret), 400);
  }
  const { id, control } = timerRemoteAccess('00'.repeat(32), secret);
  for (const bad of ['', id + '=', id.slice(1), 'x'.repeat(43), id.slice(0, -1) + 'B']) {
    rejects(() => authorizeTimerRemoteControl(bad, control, secret), 401);
  }
  for (const bad of ['', control + '=', 'x'.repeat(43), 'é'.repeat(43)]) {
    rejects(() => authorizeTimerRemoteControl(id, bad, secret), 401);
  }
});

test('secret configuration requires 32 UTF-8 bytes, explicit priority and no random fallback', () => {
  assert.equal(timerRemoteSecret({ TIMER_REMOTE_SECRET: secret, PARTICIPANT_PORTAL_SECRET: secret + '-portal' }), secret);
  assert.equal(timerRemoteSecret({ PARTICIPANT_PORTAL_SECRET: secret }), secret);
  assert.equal(timerRemoteSecret({ TIMER_REMOTE_SECRET: 'é'.repeat(16) }), 'é'.repeat(16));
  for (const env of [{}, { TIMER_REMOTE_SECRET: '' }, { TIMER_REMOTE_SECRET: 'a'.repeat(31) },
    { TIMER_REMOTE_SECRET: 'short', PARTICIPANT_PORTAL_SECRET: secret }]) {
    rejects(() => timerRemoteSecret(env), 503);
  }
});