import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
    for (const action of ['start', 'pause', 'next'] as const) {
      const command = { action, version: 'v1' };
      assert.equal(isCommandAllowed({ ...snapshot, running }, command), action === 'next' || (action === 'pause' ? running : !running));
      for (const change of [{ blocked: true }, { activeId: null }, { completed: 2 }, { version: 'v2' }]) {
        assert.equal(isCommandAllowed({ ...snapshot, running, ...change }, command), false);
      }
      assert.equal(isCommandAllowed(null, command), false);
    }
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
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
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
    process.env.UPSTASH_REDIS_REST_URL = 'http://insecure.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-only';
    assert.throws(() => store.timerRemoteTransport(), e => e.status === 503);
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
  assert.ok(store.indexOf('authorizeTimerRemoteControl(id, token') < store.indexOf('const hash = hashRemoteToken(token)'));
  assert.doesNotMatch(store, /live-session|@\/lib\/database|drizzle|neon/i);
});