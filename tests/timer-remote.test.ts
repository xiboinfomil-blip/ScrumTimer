import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import {
  authorizeRemote, commandRemoteEntry, isCommandAllowed, isRemoteToken, normalizeRemoteSnapshot,
  pendingRemoteCommand, publicRemoteState, remoteBearer, RemoteError, remoteStatus,
  REMOTE_COMMAND_TTL, REMOTE_HOST_FRESH, REMOTE_HOST_LEASE, REMOTE_PAIR_TTL,
  syncRemoteEntry, validateRemoteCommand, validateRemoteId, validateRemotePost, validateRemoteSnapshot,
} from '../src/lib/timer-remote.ts';
import type { RemoteCommandPayload, RemoteEntry, RemoteSnapshot } from '../src/lib/timer-remote.ts';

const now = 100_000;
const requestId = '12345678-1234-4234-8234-123456789abc';
const snapshot: RemoteSnapshot = { speaker: '<Alice>', nextSpeaker: 'Bob', teamName: 'Équipe', activeId: 'alice',
  running: false, remaining: 30, deadline: 0, completed: 0, total: 2, version: 'v1', blocked: false };
const payload: RemoteCommandPayload = { requestId, action: 'start', version: 'v1' };
const actions = ['start', 'pause', 'next', 'restart', 'penalty', 'black-screen'] as const;
function entry(): RemoteEntry {
  return { teamId: 'a'.repeat(64), ownerHash: 'a'.repeat(64), controlHash: 'b'.repeat(64), expiresAt: now + REMOTE_PAIR_TTL,
    hostSeenAt: now, leaseUntil: now + REMOTE_HOST_LEASE, snapshot: { ...snapshot }, pending: null,
    lastCommandId: null, lastCommandVersion: null };
}
function rejectsStatus(action: () => unknown, status: number) {
  assert.throws(action, error => error instanceof RemoteError && error.status === status);
}

test('remote snapshots are exact, finite, bounded, safe text contracts without live-session or mood data', () => {
  assert.deepEqual(validateRemoteSnapshot(snapshot), snapshot);
  assert.notEqual(validateRemoteSnapshot(snapshot), snapshot);
  for (const change of [
    { speaker: 'a'.repeat(101) }, { nextSpeaker: '\nBob' }, { teamName: '\u007f' }, { activeId: '' },
    { activeId: 1 }, { running: 'yes' }, { blocked: 0 }, { version: '' }, { version: 'x'.repeat(129) },
    { remaining: Infinity }, { remaining: NaN }, { remaining: 86_401 }, { remaining: -86_401 },
    { deadline: -1 }, { deadline: Number.MAX_VALUE }, { completed: -1 }, { completed: 0.5 },
    { total: 0 }, { total: 1001 }, { total: 0.5 }, { mood: 1 }, { owner: 'secret' },
    { running: true, activeId: null }, { running: true, blocked: true },
  ]) rejectsStatus(() => validateRemoteSnapshot({ ...snapshot, ...change }), 400);
  for (const key of Object.keys(snapshot)) {
    const incomplete = { ...snapshot } as Record<string, unknown>;
    delete incomplete[key];
    rejectsStatus(() => validateRemoteSnapshot(incomplete), 400);
  }
  for (const value of [null, [], false, 'snapshot']) rejectsStatus(() => validateRemoteSnapshot(value), 400);
  assert.equal(validateRemoteSnapshot({ ...snapshot, remaining: -100 }).remaining, -100);
  assert.equal(validateRemoteSnapshot({ ...snapshot, activeId: null, completed: 2 }).activeId, null);
});

test('optional black-screen and manual penalty snapshot fields preserve legacy wire compatibility', () => {
  for (const blackScreen of [false, true]) {
    for (const manualPenalty of [0, 1, 50, 999_950, 1_000_000]) {
      const extended = { ...snapshot, blackScreen, manualPenalty };
      assert.deepEqual(validateRemoteSnapshot(extended), extended);
      assert.deepEqual(normalizeRemoteSnapshot(extended, now), extended);
      assert.deepEqual(publicRemoteState({ ...entry(), snapshot: extended }, now).snapshot, extended);
    }
  }
  assert.equal(Object.hasOwn(validateRemoteSnapshot(snapshot), 'blackScreen'), false);
  assert.equal(Object.hasOwn(validateRemoteSnapshot(snapshot), 'manualPenalty'), false);
  for (const blackScreen of [null, 0, 1, 'true', {}, []]) {
    rejectsStatus(() => validateRemoteSnapshot({ ...snapshot, blackScreen }), 400);
  }
  for (const manualPenalty of [null, -1, 0.5, 1_000_001, NaN, Infinity, '50', true, {}, []]) {
    rejectsStatus(() => validateRemoteSnapshot({ ...snapshot, manualPenalty }), 400);
  }
});

test('opaque capabilities only come from Authorization and require the 32-byte base64url shape', () => {
  const token = 'x'.repeat(43);
  assert.equal(isRemoteToken(token), true);
  assert.equal(validateRemoteId(token), token);
  assert.equal(remoteBearer(`Bearer ${token}`), token);
  for (const value of [null, '', `bearer ${token}`, `Bearer ${token} `, `Bearer ${'x'.repeat(42)}`, `Bearer ${'='.repeat(43)}`]) {
    rejectsStatus(() => remoteBearer(value), 401);
  }
  rejectsStatus(() => validateRemoteId('id'), 400);
});

test('operation envelopes and command requestId are strict; timestamps and tokens cannot be injected', () => {
  assert.deepEqual(validateRemotePost({ operation: 'create' }), { operation: 'create' });
  const id = 'i'.repeat(43);
  assert.deepEqual(validateRemotePost({ operation: 'sync', id, snapshot, ack: requestId }), { operation: 'sync', id, snapshot, ack: requestId });
  assert.deepEqual(validateRemotePost({ operation: 'command', id, command: payload }), { operation: 'command', id, command: payload });
  assert.deepEqual(validateRemoteCommand({ ...payload, requestId: requestId.toUpperCase() }), payload);
  for (const value of [
    { operation: 'create', id }, { operation: 'create', owner: 'token' }, { operation: 'wat' },
    { operation: 'sync', id, snapshot, ack: 'wrong' }, { operation: 'sync', id, snapshot, command: payload },
    { operation: 'command', id, command: { ...payload, createdAt: 0 } },
    { operation: 'command', id, command: { ...payload, action: 'reset' } },
    { operation: 'command', id, command: { ...payload, requestId: '12345678-1234-1234-8234-123456789abc' } },
    { operation: 'command', id, command: { ...payload, version: '' } },
  ]) rejectsStatus(() => validateRemotePost(value), 400);
});

test('actions respect expected version, running, blocked, active speaker and completion', () => {
  for (const running of [false, true]) {
    for (const action of actions) {
      const command = { action, version: 'v1' };
      assert.equal(isCommandAllowed({ ...snapshot, running }, command), action === 'start' ? !running : action === 'pause' ? running : true);
      for (const change of [{ blocked: true }, { activeId: null }, { completed: 2 }, { version: 'v2' }]) {
        assert.equal(isCommandAllowed({ ...snapshot, running, ...change }, command), false);
      }
      assert.equal(isCommandAllowed(null, command), false);
    }
  }
});

test('all six actions have strict envelopes; caller-controlled amounts and targets are forbidden', () => {
  const id = 'i'.repeat(43);
  for (const action of actions) {
    const command = { ...payload, action };
    assert.deepEqual(validateRemoteCommand(command), command);
    assert.deepEqual(validateRemotePost({ operation: 'command', id, command }), { operation: 'command', id, command });
    for (const extra of [{ amount: 50 }, { manualPenalty: 0 }, { activeId: 'bob' }, { blackScreen: false }]) {
      rejectsStatus(() => validateRemoteCommand({ ...command, ...extra }), 400);
    }
  }
  for (const action of ['reset', 'restore', 'blackScreen', 'Restart', '', null, 50]) {
    rejectsStatus(() => validateRemoteCommand({ ...payload, action }), 400);
  }
});

test('black screen allows only its restore toggle, never bypassing freshness/version/dialog guards', () => {
  for (const running of [false, true]) {
    for (const action of actions) {
      const command = { action, version: 'v1' };
      const black = { ...snapshot, running, blackScreen: true, manualPenalty: 1_000_000 };
      assert.equal(isCommandAllowed(black, command), action === 'black-screen');
      for (const change of [{ blocked: true }, { activeId: null }, { completed: 2 }, { version: 'v2' }]) {
        assert.equal(isCommandAllowed({ ...black, ...change }, command), false);
      }
    }
  }
  for (const manualPenalty of [undefined, 0, 999_949, 999_950, 999_951, 1_000_000]) {
    assert.equal(isCommandAllowed({ ...snapshot, manualPenalty }, { action: 'penalty', version: 'v1' }),
      (manualPenalty ?? 0) <= 999_950);
  }
});

test('new commands are version-bound, single-use, acknowledged, and cannot replay after expiry', () => {
  for (const action of ['restart', 'penalty', 'black-screen'] as const) {
    const command = { ...payload, action };
    const original = entry();
    const queued = commandRemoteEntry(original, command, now);
    assert.equal(queued.pending?.action, action);
    assert.equal(original.pending, null);
    assert.deepEqual(queued.snapshot, original.snapshot); // The host, not the server, applies effects.
    const acked = syncRemoteEntry(queued, { ...snapshot, version: 'v2' }, requestId, now + 1);
    assert.equal(acked.pending, null);
    rejectsStatus(() => commandRemoteEntry(acked, command, now + 2), 409);
    rejectsStatus(() => commandRemoteEntry(acked, { ...command, version: 'v2' }, now + 2), 409);
    const expired = syncRemoteEntry(queued, snapshot, undefined, now + REMOTE_COMMAND_TTL + 1);
    rejectsStatus(() => commandRemoteEntry(expired, { ...command, requestId: '22345678-1234-4234-8234-123456789abc' }, now + REMOTE_COMMAND_TTL + 2), 409);
    const black = { ...entry(), snapshot: { ...snapshot, blackScreen: true } };
    if (action === 'black-screen') assert.equal(commandRemoteEntry(black, command, now).pending?.action, action);
    else rejectsStatus(() => commandRemoteEntry(black, command, now), 409);
  }
});

test('server clock rebases signed remaining and paused deadlines without mutating input', () => {
  assert.equal(normalizeRemoteSnapshot({ ...snapshot, running: true, deadline: 9_999_999 }, now).deadline, now + 30_000);
  assert.equal(normalizeRemoteSnapshot({ ...snapshot, running: true, remaining: -2 }, now).deadline, now - 2_000);
  assert.equal(normalizeRemoteSnapshot({ ...snapshot, deadline: 999 }, now).deadline, 0);
  assert.equal(snapshot.deadline, 0);
});

test('host lease is capped at ten seconds and pairing absolute expiry never slides', () => {
  const original = entry();
  const synced = syncRemoteEntry(original, snapshot, undefined, now + 1_000);
  assert.equal(synced.hostSeenAt, now + 1_000);
  assert.equal(synced.leaseUntil, now + 1_000 + REMOTE_HOST_LEASE);
  assert.equal(synced.expiresAt, original.expiresAt);
  const nearExpiry = syncRemoteEntry(original, snapshot, undefined, original.expiresAt - 1);
  assert.equal(nearExpiry.leaseUntil, original.expiresAt);
  assert.equal(remoteStatus({ ...original, hostSeenAt: null, snapshot: null }, now), 'waiting');
  assert.equal(remoteStatus(original, now + REMOTE_HOST_FRESH), 'online');
  assert.equal(remoteStatus(original, now + REMOTE_HOST_FRESH + 1), 'stale');
  assert.equal(remoteStatus({ ...original, leaseUntil: now - 1 }, now), 'stale');
});

test('owner/control authorization is role-specific and pairing-scoped; expired entries are gone', () => {
  const original = entry();
  assert.equal(authorizeRemote(original, original.ownerHash, 'owner', now), original);
  assert.equal(authorizeRemote(original, original.controlHash, 'control', now), original);
  rejectsStatus(() => authorizeRemote(original, original.ownerHash, 'control', now), 401);
  rejectsStatus(() => authorizeRemote(original, original.controlHash, 'owner', now), 401);
  rejectsStatus(() => authorizeRemote({ ...original, ownerHash: 'another-pair' }, original.ownerHash, 'owner', now), 401);
  rejectsStatus(() => authorizeRemote(null, original.ownerHash, 'owner', now), 404);
  rejectsStatus(() => authorizeRemote(original, original.ownerHash, 'owner', original.expiresAt), 404);
});

test('single pending slot rejects concurrent commands without overwriting the first', () => {
  const original = entry();
  const queued = commandRemoteEntry(original, payload, now);
  assert.equal(original.pending, null);
  assert.deepEqual(queued.pending, { id: requestId, action: 'start', version: 'v1', createdAt: now });
  rejectsStatus(() => commandRemoteEntry(queued, { ...payload, requestId: '22345678-1234-4234-8234-123456789abc' }, now + 1), 409);
  assert.equal(queued.pending?.id, requestId);
  rejectsStatus(() => commandRemoteEntry(original, payload, now + REMOTE_HOST_FRESH + 1), 409);
});

test('sync publishes snapshot first, preserves concurrent pending, and only matching ack clears it', () => {
  const queued = commandRemoteEntry(entry(), payload, now);
  const updated = { ...snapshot, version: 'v2', running: true };
  const synced = syncRemoteEntry(queued, updated, 'other-ack', now + 1);
  assert.equal(synced.snapshot?.version, 'v2');
  assert.equal(synced.snapshot?.deadline, now + 1 + 30_000);
  assert.equal(synced.pending?.id, requestId);
  const acked = syncRemoteEntry(synced, updated, requestId, now + 2);
  assert.equal(acked.pending, null);
  rejectsStatus(() => commandRemoteEntry(acked, { ...payload, action: 'pause', version: 'v2' }, now + 3), 409);
  const nextPayload = { ...payload, requestId: '22345678-1234-4234-8234-123456789abc', version: 'v2', action: 'pause' as const };
  assert.equal(commandRemoteEntry(acked, nextPayload, now + 3).pending?.action, 'pause');
});

test('five-second pending expiry is exact and old versions cannot be replayed after ack or expiry', () => {
  const queued = commandRemoteEntry(entry(), payload, now);
  assert.equal(pendingRemoteCommand(queued, now + REMOTE_COMMAND_TTL)?.id, requestId);
  assert.equal(pendingRemoteCommand(queued, now + REMOTE_COMMAND_TTL + 1), null);
  assert.equal(pendingRemoteCommand(queued, now - 1), null);
  const expired = syncRemoteEntry(queued, snapshot, undefined, now + REMOTE_COMMAND_TTL + 1);
  assert.equal(expired.pending, null);
  rejectsStatus(() => commandRemoteEntry(expired, { ...payload, requestId: '22345678-1234-4234-8234-123456789abc' }, now + 5_002), 409);
  const acked = syncRemoteEntry(queued, snapshot, requestId, now + 1);
  rejectsStatus(() => commandRemoteEntry(acked, payload, now + 2), 409);
});

test('public reads reveal only snapshot, host status and server clock', () => {
  const publicState = publicRemoteState(commandRemoteEntry(entry(), payload, now), now);
  assert.deepEqual(Object.keys(publicState).sort(), ['serverNow', 'snapshot', 'status']);
  assert.equal(publicState.status, 'online');
  assert.notEqual(publicState.snapshot, snapshot);
  assert.equal(JSON.stringify(publicState).includes('Hash'), false);
  assert.equal(JSON.stringify(publicState).includes(requestId), false);
});

test('actual instance store: reusable links, owner leases, races, rotation, downtime and bounded state', () => {
  // server-only's official react-server condition allows Node testing without modifying dependencies.
  const storeUrl = new URL('../src/lib/timer-remote-store.ts', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    delete process.env.VERCEL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.REDIS_URL;
    process.env.TIMER_REMOTE_SECRET = 'timer-remote-test-only-secret-32-bytes-minimum';
    delete process.env.PARTICIPANT_PORTAL_SECRET;
    const store = await import(${JSON.stringify(storeUrl)});
    const map = globalThis.__standupTimerRemote;
    const snapshot = ${JSON.stringify(snapshot)};
    const command = ${JSON.stringify(payload)};
    const teamA = 'a'.repeat(64);
    const teamB = 'b'.repeat(64);
    const a = await store.createTimerRemote(teamA);
    const b = await store.createTimerRemote(teamB);
    assert.equal(a.transport, 'instance');
    assert.equal(a.reusable, true);
    assert.equal(a.id, Buffer.from(teamA, 'hex').toString('base64url'));
    await assert.rejects(store.createTimerRemote(teamA), e => e.status === 409);
    assert.equal(Buffer.from(a.owner, 'base64url').length, 32);
    assert.equal(Buffer.from(a.control, 'base64url').length, 32);
    assert.notEqual(a.owner, a.control);
    const serialized = JSON.stringify([...map]);
    assert.equal(serialized.includes(a.owner), false);
    assert.equal(serialized.includes(a.control), false);
    assert.match(map.get(a.id).ownerHash, /^[a-f0-9]{64}$/);
    assert.equal((await store.readTimerRemote(a.id, a.control)).status, 'waiting');
    await assert.rejects(store.readTimerRemote(a.id, b.control), e => e.status === 401);
    await assert.rejects(store.syncTimerRemote(a.id, a.control, snapshot), e => e.status === 401);
    await store.syncTimerRemote(a.id, a.owner, snapshot);
    await assert.rejects(store.createTimerRemote(teamA), e => e.status === 409);
    process.env.TIMER_REMOTE_SECRET += '-rotated';
    await assert.rejects(store.readTimerRemote(a.id, a.control), e => e.status === 401);
    await assert.rejects(store.commandTimerRemote(a.id, a.control, command), e => e.status === 401);
    process.env.TIMER_REMOTE_SECRET = 'timer-remote-test-only-secret-32-bytes-minimum';
    const race = await Promise.allSettled([
      store.commandTimerRemote(a.id, a.control, command),
      store.commandTimerRemote(a.id, a.control, { ...command, requestId: '22345678-1234-4234-8234-123456789abc' }),
      store.syncTimerRemote(a.id, a.owner, snapshot),
    ]);
    assert.equal(race[0].status, 'fulfilled');
    assert.equal(race[1].status, 'rejected');
    assert.equal(race[2].value.command.id, command.requestId);
    assert.equal(map.get(a.id).pending.id, command.requestId);
    assert.equal(map.get(a.id).expiresAt, a.expiresAt);
    const sync = await store.syncTimerRemote(a.id, a.owner, { ...snapshot, running: true, version: 'v2' }, command.requestId);
    assert.equal(sync.command, null);
    await assert.rejects(store.revokeTimerRemote(a.id, a.control), e => e.status === 401);
    assert.equal((await store.revokeTimerRemote(a.id, a.owner)).revoked, true);
    const waiting = await store.readTimerRemote(a.id, a.control);
    assert.deepEqual(waiting, { snapshot: null, status: 'waiting', serverNow: waiting.serverNow, transport: 'instance' });
    await assert.rejects(store.commandTimerRemote(a.id, a.control, command), e => e.status === 409);
    await assert.rejects(store.readTimerRemote(a.id, b.control), e => e.status === 401);
    const restarted = await store.createTimerRemote(teamA);
    assert.equal(restarted.id, a.id);
    assert.equal(restarted.control, a.control);
    assert.notEqual(restarted.owner, a.owner);
    await assert.rejects(store.syncTimerRemote(a.id, a.owner, snapshot), e => e.status === 401);
    await assert.rejects(store.revokeTimerRemote(a.id, a.owner), e => e.status === 401);
    await store.syncTimerRemote(a.id, restarted.owner, snapshot);
    const realNow = Date.now;
    const staleNow = map.get(a.id).leaseUntil + 1;
    Date.now = () => staleNow;
    assert.equal((await store.readTimerRemote(a.id, a.control)).status, 'waiting');
    assert.equal((await store.readTimerRemote(a.id, a.control)).snapshot, null);
    await assert.rejects(store.commandTimerRemote(a.id, a.control, command), e => e.status === 409);
    const takeover = await Promise.allSettled([store.createTimerRemote(teamA), store.createTimerRemote(teamA)]);
    Date.now = realNow;
    assert.equal(takeover.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(takeover.find(r => r.status === 'rejected').reason.status, 409);
    const replacement = takeover.find(r => r.status === 'fulfilled').value;
    assert.equal(replacement.control, a.control);
    assert.notEqual(replacement.owner, restarted.owner);
    await assert.rejects(store.syncTimerRemote(a.id, restarted.owner, snapshot), e => e.status === 401);
    await store.revokeTimerRemote(a.id, replacement.owner);
    map.get(b.id).expiresAt = Date.now() - 1;
    assert.equal((await store.readTimerRemote(b.id, b.control)).status, 'waiting');
    await assert.rejects(store.commandTimerRemote(b.id, b.control, command), e => e.status === 409);
    await assert.rejects(store.syncTimerRemote(b.id, b.owner, snapshot), e => e.status === 401);
    assert.equal(map.size, 0);
    // Process restart loses host state, never the reusable capability.
    const reloaded = await store.createTimerRemote(teamA);
    assert.equal(reloaded.control, a.control);
    map.clear();
    const independent = await import(${JSON.stringify(storeUrl)} + '?independent-bundle');
    assert.equal((await independent.readTimerRemote(a.id, a.control)).status, 'waiting');
    assert.equal((await independent.createTimerRemote(teamA)).control, a.control);
    map.clear();
    delete process.env.TIMER_REMOTE_SECRET;
    await assert.rejects(store.createTimerRemote(teamA), e => e.status === 503);
    await assert.rejects(store.readTimerRemote(a.id, a.control), e => e.status === 503);
    assert.equal(map.size, 0);
    process.env.PARTICIPANT_PORTAL_SECRET = 'timer-remote-test-only-secret-32-bytes-minimum';
    assert.equal((await store.createTimerRemote(teamA)).control, a.control);
    map.clear();
    for (let i = 0; i < 512; i++) await store.createTimerRemote(i.toString(16).padStart(64, '0'));
    await assert.rejects(store.createTimerRemote('f'.repeat(64)), e => e.status === 503);
    assert.equal(map.size, 512);
    map.values().next().value.expiresAt = Date.now() - 1;
    await store.createTimerRemote('f'.repeat(64));
    assert.equal(map.size, 512);
    process.env.VERCEL = '1';
    try {
      assert.throws(() => store.timerRemoteTransport(), e => e.status === 503 && e.code === 'REMOTE_REDIS_REQUIRED');
      await assert.rejects(store.createTimerRemote(teamA), e => e.status === 503);
      await assert.rejects(store.readTimerRemote(a.id, a.control), e => e.status === 503);
      await assert.rejects(store.syncTimerRemote(a.id, a.owner, snapshot), e => e.status === 503);
      await assert.rejects(store.commandTimerRemote(a.id, a.control, command), e => e.status === 503);
      await assert.rejects(store.revokeTimerRemote(a.id, a.owner), e => e.status === 503);
      process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
      assert.throws(() => store.timerRemoteTransport(), e => e.status === 503 && e.code === 'REMOTE_REDIS_CONFIG_INVALID');
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-only';
      assert.equal(store.timerRemoteTransport(), 'shared');
      delete process.env.UPSTASH_REDIS_REST_URL;
      assert.throws(() => store.timerRemoteTransport(), e => e.status === 503);
    } finally {
      delete process.env.VERCEL;
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
    assert.equal(store.timerRemoteTransport(), 'instance');
    process.env.UPSTASH_REDIS_REST_URL = 'http://insecure.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-only';
    assert.throws(() => store.timerRemoteTransport(), e => e.status === 503 && e.code === 'REMOTE_REDIS_CONFIG_INVALID');
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    assert.throws(() => store.timerRemoteTransport(), e => e.status === 503);
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-only';
    const calls = [];
    let reply = {snapshot: null, status: 'waiting', serverNow: 1};
    globalThis.fetch = async (url, init) => {
      calls.push({url, init});
      return Response.json({result: JSON.stringify(reply)});
    };
    assert.equal((await store.readTimerRemote(b.id, b.control)).transport, 'shared');
    const args = JSON.parse(calls[0].init.body);
    assert.equal(args[0], 'EVAL');
    assert.equal(args[2], 1);
    assert.equal(args[3], 'standup:timer-remote:' + b.id);
    assert.equal(args[4], 'read');
    assert.equal(args[5], store.hashRemoteToken(b.control));
    assert.equal(calls[0].init.body.includes(b.control), false);
    assert.equal(calls[0].init.redirect, 'error');
    // Exercise the real shared adapter envelopes for every new command. These
    // are mocked Redis replies; Lua authorization is asserted separately below.
    for (const action of ['restart', 'penalty', 'black-screen']) {
      const input = { ...command, action };
      reply = {accepted: true, serverNow: 1};
      assert.equal((await store.commandTimerRemote(b.id, b.control, input)).accepted, true);
      const wire = JSON.parse(calls.at(-1).init.body);
      assert.equal(wire[0], 'EVAL');
      assert.equal(wire[2], 1);
      assert.equal(wire[4], 'command');
      assert.equal(wire[5], store.hashRemoteToken(b.control));
      assert.deepEqual(JSON.parse(wire[6]), input);
      assert.equal(calls.at(-1).init.body.includes(b.control), false);
    }
    const callsBeforeInvalid = calls.length;
    await assert.rejects(store.readTimerRemote(b.id, a.control), e => e.status === 401);
    await assert.rejects(store.commandTimerRemote(b.id, a.control, command), e => e.status === 401);
    assert.equal(calls.length, callsBeforeInvalid);
    process.env.PARTICIPANT_PORTAL_SECRET += '-rotated';
    await assert.rejects(store.readTimerRemote(b.id, b.control), e => e.status === 401);
    assert.equal(calls.length, callsBeforeInvalid);
    process.env.PARTICIPANT_PORTAL_SECRET = 'timer-remote-test-only-secret-32-bytes-minimum';
    reply = {expiresAt: 123456, serverNow: 1};
    const shared = await store.createTimerRemote(teamA);
    assert.equal(shared.control, a.control);
    assert.equal(shared.id, a.id);
    assert.equal(shared.expiresAt, 123456);
    assert.equal(shared.reusable, true);
    const createArgs = JSON.parse(calls.at(-1).init.body);
    const sharedEntry = JSON.parse(createArgs[4]);
    assert.equal(sharedEntry.ownerHash, store.hashRemoteToken(shared.owner));
    assert.equal(sharedEntry.controlHash, store.hashRemoteToken(a.control));
    assert.equal(calls.at(-1).init.body.includes(shared.owner), false);
    reply = {error: 409};
    await assert.rejects(store.createTimerRemote(teamA), e => e.status === 409);
    await assert.rejects(store.commandTimerRemote(b.id, b.control, command), e => e.status === 409);
    reply = {error: 401};
    await assert.rejects(store.syncTimerRemote(a.id, a.owner, snapshot), e => e.status === 401);
    await assert.rejects(store.revokeTimerRemote(a.id, a.owner), e => e.status === 401);
    globalThis.fetch = async () => Response.json({result: JSON.stringify({error: 401})});
    await assert.rejects(store.readTimerRemote(b.id, b.control), e => e.status === 401);
    globalThis.fetch = async () => { throw new Error('secret upstream detail'); };
    await assert.rejects(store.readTimerRemote(b.id, b.control), e => e.status === 503 && !e.message.includes('secret'));
    console.log('instance/shared adapter assertions passed');
  `;
  const output = execFileSync(process.execPath, ['--conditions=react-server', '--experimental-strip-types', '--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.match(output, /adapter assertions passed/);
});

test('remote handlers time every success and failure from entry with only a monotonic duration', async () => {
  const source = readFileSync(new URL('../src/app/api/timer-remote/route.ts', import.meta.url), 'utf8');
  const remote = await import('../src/lib/timer-remote.ts');
  let clock = 100;
  let storeError: unknown;
  const storeOperation = async () => {
    clock += 11;
    if (storeError) throw storeError;
    return { transport: 'shared' };
  };
  const modules: Record<string, unknown> = {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/database': {
      sameOrigin: (request: Request) => { clock += 2; return request.headers.get('origin') === 'https://remote.example'; },
      readJson: async (request: Request) => { clock += 7; return request.json(); },
      selectedTeam: async () => { clock += 5; return 'a'.repeat(64); },
    },
    '@/lib/timer-remote': remote,
    '@/lib/timer-remote-store': {
      readTimerRemote: storeOperation, createTimerRemote: storeOperation, syncTimerRemote: storeOperation,
      commandTimerRemote: storeOperation, revokeTimerRemote: storeOperation,
    },
  };
  const handlers: Record<string, (request: Request) => Promise<Response>> = {};
  // Execute the actual handlers with deterministic dependencies, no database or Redis access.
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: handlers,
    require: (name: string) => {
      assert.ok(Object.hasOwn(modules, name));
      return modules[name];
    },
    Request, ReadableStream, URL,
    performance: { now: () => clock },
    Date: { now: () => { throw new Error('Timing must not use the wall clock'); } },
  });
  const id = 'i'.repeat(43);
  const token = 'x'.repeat(43);
  async function check(method: string, body: unknown, status: number, duration: number, options: { origin?: string; auth?: boolean; query?: string; raw?: string } = {}) {
    clock = 100;
    const request = new Request(`https://remote.example/api/timer-remote${options.query ?? `?id=${id}`}`, {
      method,
      headers: {
        origin: options.origin ?? 'https://remote.example',
        ...(options.auth === false ? {} : { authorization: `Bearer ${token}` }),
      },
      ...(method === 'GET' ? {} : { body: options.raw ?? JSON.stringify(body) }),
    });
    const response = await handlers[method](request);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('server-timing'), `remote;dur=${duration.toFixed(2)}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    if (status >= 400) assert.deepEqual(await response.json(), { error: 'Télécommande indisponible.' });
  }
  await check('GET', null, 200, 11);
  await check('POST', { operation: 'create' }, 201, 25);
  await check('POST', { operation: 'sync', id, snapshot }, 200, 20);
  await check('POST', { operation: 'command', id, command: payload }, 200, 20);
  for (const action of ['restart', 'penalty', 'black-screen']) {
    await check('POST', { operation: 'command', id, command: { ...payload, action } }, 200, 20);
  }
  await check('POST', { operation: 'sync', id, snapshot: { ...snapshot, blackScreen: true, manualPenalty: 50 } }, 200, 20);
  await check('DELETE', { id }, 200, 20);
  await check('GET', null, 401, 0, { auth: false });
  await check('GET', null, 400, 0, { query: `?id=${id}&extra=1` });
  for (const method of ['POST', 'DELETE']) {
    await check(method, { id }, 403, 2, { origin: 'https://other.example' });
    await check(method, { id }, 400, 9, { raw: '{' });
    await check(method, { id }, 400, 9, { raw: ' '.repeat(8193) });
  }
  for (const error of [new RemoteError(503), new Error('private upstream details')]) {
    storeError = error;
    await check('GET', null, 503, 11);
    await check('POST', { operation: 'create' }, 503, 25);
    await check('POST', { operation: 'sync', id, snapshot }, 503, 20);
    await check('POST', { operation: 'command', id, command: payload }, 503, 20);
    await check('DELETE', { id }, 503, 20);
  }
});

test('route/store security invariants: bounded JSON, no-store, selected-team creation only, single-key atomic Redis', () => {
  const route = readFileSync(new URL('../src/app/api/timer-remote/route.ts', import.meta.url), 'utf8');
  const store = readFileSync(new URL('../src/lib/timer-remote-store.ts', import.meta.url), 'utf8');
  assert.match(route, /'Cache-Control': 'no-store'/);
  assert.equal((route.match(/if \(!sameOrigin\(request\)\)/g) ?? []).length, 2);
  assert.match(route, /readJson\(new Request/);
  assert.match(route, /size > REMOTE_MAX_BODY_BYTES/);
  assert.equal((route.match(/await selectedTeam\(request\)/g) ?? []).length, 1);
  assert.match(store, /'EVAL', script, 1/);
  assert.match(store, /redis.call\('TIME'\)/);
  assert.match(store, /'KEEPTTL'/);
  assert.match(store, /expected~=ARGV\[2\]/);
  assert.match(store, /previous\.expiresAt>now and previous\.leaseUntil>now then return cjson.encode\(\{error=409\}\)/);
  assert.match(store, /e\.leaseUntil=now\+\$\{REMOTE_HOST_LEASE\}/);
  assert.doesNotMatch(store, /'NX'/);
  assert.match(store, /if op=='read' then return cjson.encode\(\{snapshot=cjson.null,status='waiting',serverNow=now\}\)/);
  assert.match(store, /if op=='command' then return cjson.encode\(\{error=409\}\)/);
  assert.match(store, /op=='read' and e\.leaseUntil<=now/);
  // The shared Lua transport must enforce the same six-action guard as the pure
  // instance transition BEFORE writing the pending slot (no live Redis required).
  const commandBranch = store.slice(store.indexOf("elseif op=='command' then"), store.indexOf("if op=='sync' or op=='command' then redis.call"));
  assert.match(commandBranch, /s\.blackScreen==true and input\.action~='black-screen'/);
  assert.match(commandBranch, /input\.action=='penalty' and \(s\.manualPenalty or 0\)>999950/);
  assert.match(commandBranch, /s\.version~=input\.version/);
  assert.match(commandBranch, /has\(pending\(\)\) or e\.lastCommandId==input\.requestId or e\.lastCommandVersion==input\.version/);
  for (const action of actions) assert.ok(commandBranch.includes(`input.action~='${action}'`), action);
  const pendingWrite = commandBranch.indexOf('e.pending={');
  assert.ok(pendingWrite > commandBranch.indexOf('s.blackScreen==true'));
  assert.ok(pendingWrite > commandBranch.indexOf("input.action=='penalty'"));
  assert.match(commandBranch, /e\.pending=\{id=input\.requestId,action=input\.action,version=input\.version,createdAt=now\}/);
  assert.doesNotMatch(commandBranch, /s\.manualPenalty\s*=|s\.blackScreen\s*=\s*[^=]|s\.remaining\s*=/);
  assert.ok(store.indexOf('authorizeTimerRemoteControl(id, token') < store.indexOf('const hash = hashRemoteToken(token)'));
  assert.doesNotMatch(store, /live-session|@\/lib\/database|drizzle|neon/i);
});