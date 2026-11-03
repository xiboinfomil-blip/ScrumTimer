import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { authorizeTimerRemoteControl, timerRemoteAccess, timerRemoteSecret, timerRemoteTeamId } from './timer-remote-access.ts';
import {
  authorizeRemote, commandRemoteEntry, pendingRemoteCommand, publicRemoteState, RemoteError,
  REMOTE_COMMAND_TTL, REMOTE_HOST_FRESH, REMOTE_HOST_LEASE, REMOTE_MAX_ENTRIES, REMOTE_PAIR_TTL, REMOTE_PHONE_LEASE, syncRemoteEntry,
} from './timer-remote.ts';
import type { RemoteCommandPayload, RemoteEntry, RemoteSnapshot, RemoteTransport } from './timer-remote.ts';
import { evalRemoteRedis, remoteRedisAdapter } from './remote-redis.ts';

const globalStore = globalThis as typeof globalThis & { __standupTimerRemote?: Map<string, RemoteEntry> };
const entries = globalStore.__standupTimerRemote ??= new Map<string, RemoteEntry>();
const keyPrefix = 'standup:timer-remote:';

export function timerRemoteTransport(): RemoteTransport {
  if (!remoteRedisAdapter()) {
    if (process.env.VERCEL === '1') throw new RemoteError(503, 'REMOTE_REDIS_REQUIRED');
    return 'instance';
  }
  return 'shared';
}

export function hashRemoteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** One EVAL / one key: auth, expiration, snapshot, ack and pending changes are indivisible.
 * Redis TIME, not a caller's clock, is authoritative across server instances.
 * SET KEEPTTL preserves the original absolute four-hour expiry on every mutation.
 */
const operationScript = `
local clock=redis.call('TIME')
local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)
local op=ARGV[1]
local function missing()
  if op=='read' then return cjson.encode({snapshot=cjson.null,status='waiting',serverNow=now,phoneConnected=false}) end
  if op=='command' then return cjson.encode({error=409}) end
  return cjson.encode({error=401})
end
local raw=redis.call('GET',KEYS[1])
if not raw then return missing() end
local e=cjson.decode(raw)
if e.expiresAt<=now then redis.call('DEL',KEYS[1]); return missing() end
local expected=e.controlHash
if op=='sync' or op=='revoke' or op=='phone-enable' or op=='phone-disconnect' then expected=e.ownerHash end
if expected~=ARGV[2] then return cjson.encode({error=401}) end
if op=='revoke' then redis.call('DEL',KEYS[1]); return cjson.encode({revoked=true}) end
local function has(v) return v~=nil and v~=cjson.null end
local phoneChanged=false
local function pending()
  if has(e.pending) and now>=e.pending.createdAt and now-e.pending.createdAt<=${REMOTE_COMMAND_TTL} then return e.pending end
  return cjson.null
end
local function status()
  if not has(e.hostSeenAt) or not has(e.snapshot) then return 'waiting' end
  if now<e.leaseUntil and now-e.hostSeenAt<=${REMOTE_HOST_FRESH} then return 'online' end
  return 'stale'
end
local function phoneConnected()
  return has(e.phoneHash) and has(e.phoneLeaseUntil) and tonumber(e.phoneLeaseUntil)>now
end
if op=='read' then
  local input=cjson.decode(ARGV[3])
  if has(input.phoneHash) then
      if e.phoneEnabled==false then return cjson.encode({error=409,code='REMOTE_PHONE_DISCONNECTED'}) end
    if phoneConnected() and e.phoneHash~=input.phoneHash then return cjson.encode({error=409,code='REMOTE_PHONE_IN_USE'}) end
    e.phoneHash=input.phoneHash
    e.phoneLeaseUntil=now+${REMOTE_PHONE_LEASE}
    phoneChanged=true
  end
elseif op=='phone-disconnect' then
  if phoneConnected() then phoneChanged=true end
  if e.phoneEnabled==true then phoneChanged=true end
  e.phoneEnabled=false
  e.phoneHash=cjson.null
  e.phoneLeaseUntil=0
elseif op=='phone-enable' then
  if e.phoneEnabled~=true then phoneChanged=true end
  e.phoneEnabled=true
elseif op=='phone-leave' then
  local input=cjson.decode(ARGV[3])
  if phoneConnected() and e.phoneHash==input.phoneHash then
    e.phoneHash=cjson.null
    e.phoneLeaseUntil=0
    phoneChanged=true
  end
elseif op=='sync' then
  local input=cjson.decode(ARGV[3])
  e.snapshot=input.snapshot
  e.snapshot.deadline=0
  if e.snapshot.running then e.snapshot.deadline=now+e.snapshot.remaining*1000 end
  e.hostSeenAt=now
  e.leaseUntil=math.min(e.expiresAt,now+${REMOTE_HOST_LEASE})
  e.pending=pending()
  if has(e.pending) and e.pending.id==input.ack then e.pending=cjson.null end
elseif op=='command' then
  local input=cjson.decode(ARGV[3])
  if not phoneConnected() or not has(input.phoneHash) or input.phoneHash~=e.phoneHash then return cjson.encode({error=409}) end
  local s=e.snapshot
  if status()~='online' or not has(s) or s.blocked or s.version~=input.version then return cjson.encode({error=409}) end
  if s.page=='timer' then
    if not has(s.activeId) or s.activeId=='' or s.completed>=s.total then return cjson.encode({error=409}) end
    if (input.action=='start' and s.running) or (input.action=='pause' and not s.running) then return cjson.encode({error=409}) end
    if s.blackScreen==true and input.action~='black-screen' then return cjson.encode({error=409}) end
    if input.action=='penalty' and (s.manualPenalty or 0)>999950 then return cjson.encode({error=409}) end
    if input.action~='start' and input.action~='pause' and input.action~='next' and input.action~='restart' and input.action~='penalty' and input.action~='black-screen' then return cjson.encode({error=409}) end
  elseif s.page=='participants' then
    if input.action=='participant-continue' then
      if not s.canContinue then return cjson.encode({error=409}) end
    elseif input.action=='attendance-toggle' then
      local person=s.participants[input.targetIndex+1]
      if not has(s.activeId) or s.activeId=='' or input.targetIndex<0 or not person then return cjson.encode({error=409}) end
    elseif (input.action=='participant-previous' or input.action=='participant-next') and s.participantCount>1 then
      if not has(s.activeId) or s.activeId=='' then return cjson.encode({error=409}) end
    else return cjson.encode({error=409}) end
  elseif s.page=='mood' then
    if input.action=='mood-continue' then
      if not s.canContinue then return cjson.encode({error=409}) end
    elseif input.action=='participant-previous' or input.action=='participant-next' then
      if not has(s.activeId) or s.activeId=='' or s.participantCount<=1 then return cjson.encode({error=409}) end
    elseif input.action=='mood-1' or input.action=='mood-2' or input.action=='mood-3' or input.action=='mood-4' or input.action=='mood-postpone' then
      local person=s.participants[input.targetIndex+1]
      if not has(s.activeId) or s.activeId=='' or input.targetIndex<0 or not person or not person.present then return cjson.encode({error=409}) end
      if input.action=='mood-postpone' and not s.canPostpone then return cjson.encode({error=409}) end
      if input.action~='mood-postpone' and not s.canVote then return cjson.encode({error=409}) end
    else return cjson.encode({error=409}) end
  else return cjson.encode({error=409}) end
  if has(pending()) or e.lastCommandId==input.requestId or e.lastCommandVersion==input.version then return cjson.encode({error=409}) end
  e.pending={id=input.requestId,action=input.action,version=input.version,createdAt=now}
  if input.targetIndex~=nil then e.pending.targetIndex=input.targetIndex end
  if input.targetIndex~=nil then e.pending.targetIndex=input.targetIndex end
  e.lastCommandId=input.requestId
  e.lastCommandVersion=input.version
end
if op=='sync' or op=='command' or phoneChanged then redis.call('SET',KEYS[1],cjson.encode(e),'KEEPTTL') end
if op=='command' then return cjson.encode({accepted=true,command=e.pending,serverNow=now,phoneConnected=phoneConnected()}) end
if op=='phone-disconnect' or op=='phone-leave' then return cjson.encode({disconnected=true,phoneConnected=phoneConnected()}) end
local result={snapshot=e.snapshot,status=status(),serverNow=now,phoneConnected=phoneConnected()}
if op=='read' and e.leaseUntil<=now then result.snapshot=cjson.null; result.status='waiting' end
if op=='sync' then result.command=pending(); result.consumedVersion=e.lastCommandVersion end
return cjson.encode(result)
`;

const createScript = `
local clock=redis.call('TIME')
local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)
local raw=redis.call('GET',KEYS[1])
if raw then
  local previous=cjson.decode(raw)
  if previous.expiresAt>now and previous.leaseUntil>now then return cjson.encode({error=409}) end
end
local e=cjson.decode(ARGV[1])
e.expiresAt=now+${REMOTE_PAIR_TTL}
e.leaseUntil=now+${REMOTE_HOST_LEASE}
redis.call('SET',KEYS[1],cjson.encode(e),'PX',${REMOTE_PAIR_TTL})
return cjson.encode({expiresAt=e.expiresAt,serverNow=now})
`;

async function redisEval(script: string, id: string, ...args: string[]): Promise<Record<string, unknown>> {
  try {
    let raw: unknown;
    if (remoteRedisAdapter() === 'redis') {
      raw = await evalRemoteRedis(script, `${keyPrefix}${id}`, args);
    } else {
      const response = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['EVAL', script, 1, `${keyPrefix}${id}`, ...args]),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5_000),
    });
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (body.error) throw new Error();
      raw = body.result;
    }
    if (typeof raw !== 'string') throw new Error();
    const result = JSON.parse(raw) as Record<string, unknown>;
    if (result.error === 401 || result.error === 404 || result.error === 409) {
      const code = result.code === 'REMOTE_PHONE_IN_USE' || result.code === 'REMOTE_PHONE_DISCONNECTED' ? result.code : undefined;
      throw new RemoteError(result.error, code);
    }
    if (result.error) throw new Error();
    return result;
  } catch (error) {
    if (error instanceof RemoteError) throw error;
    throw new RemoteError(503, 'REMOTE_REDIS_UNAVAILABLE');
  }
}

function prune(now: number) {
  for (const [id, entry] of entries) if (entry.expiresAt <= now) entries.delete(id);
}

export async function createTimerRemote(teamId: string) {
  const { id, control } = timerRemoteAccess(teamId, timerRemoteSecret(process.env));
  const transport = timerRemoteTransport();
  const owner = randomBytes(32).toString('base64url');
  const now = Date.now();
  const entry: RemoteEntry = { teamId, ownerHash: hashRemoteToken(owner), controlHash: hashRemoteToken(control),
    expiresAt: now + REMOTE_PAIR_TTL, hostSeenAt: null, leaseUntil: now + REMOTE_HOST_LEASE,
    phoneHash: null, phoneLeaseUntil: 0, phoneEnabled: true, snapshot: null,
    pending: null, lastCommandId: null, lastCommandVersion: null };
  let timing: { expiresAt: number; serverNow: number };
  if (transport === 'shared') {
    timing = await redisEval(createScript, id, JSON.stringify(entry)) as unknown as typeof timing;
  } else {
    prune(now);
    const previous = entries.get(id);
    if (previous && previous.leaseUntil > now) throw new RemoteError(409);
    // Refuse new pairs rather than silently evicting a still-live host.
    if (!previous && entries.size >= REMOTE_MAX_ENTRIES) throw new RemoteError(503);
    entries.set(id, entry);
    timing = { expiresAt: entry.expiresAt, serverNow: now };
  }
  return { id, owner, control, ...timing, transport, reusable: true };
}

type Operation = 'read' | 'sync' | 'command' | 'revoke' | 'phone-enable' | 'phone-disconnect' | 'phone-leave';
async function operate(op: Operation, id: string, token: string, input?: { snapshot: RemoteSnapshot; ack?: string } | RemoteCommandPayload, phoneId?: string) {
  const isControl = op === 'read' || op === 'command' || op === 'phone-leave';
  // Always verify against the current stable secret BEFORE trusting any stored hash.
  if (isControl) authorizeTimerRemoteControl(id, token, timerRemoteSecret(process.env));
  else timerRemoteTeamId(id);
  const transport = timerRemoteTransport();
  const hash = hashRemoteToken(token);
  const phoneHash = phoneId ? hashRemoteToken(phoneId) : undefined;
  const operationInput = op === 'read' || op === 'phone-leave' ? { ...(phoneHash ? { phoneHash } : {}) }
    : op === 'command' ? { ...(input as RemoteCommandPayload), ...(phoneHash ? { phoneHash } : {}) } : input ?? {};
  if (transport === 'shared') {
    const result = await redisEval(operationScript, id, op, hash, JSON.stringify(operationInput));
    return { ...result, transport };
  }
  // No await between lookup/auth/transition/write: atomic within this process, including HMR bundles.
  const now = Date.now();
  prune(now);
  const stored = entries.get(id);
  if (!stored) {
    if (op === 'read') return { snapshot: null, status: 'waiting', serverNow: now, transport };
    throw new RemoteError(op === 'command' ? 409 : 401);
  }
  let entry = authorizeRemote(stored, hash, isControl ? 'control' : 'owner', now);
  if (op === 'read') {
    if (phoneHash) {
      if (entry.phoneEnabled === false) throw new RemoteError(409, 'REMOTE_PHONE_DISCONNECTED');
      if (entry.phoneHash && entry.phoneLeaseUntil > now && entry.phoneHash !== phoneHash) throw new RemoteError(409, 'REMOTE_PHONE_IN_USE');
      entry = { ...entry, phoneHash, phoneLeaseUntil: now + REMOTE_PHONE_LEASE };
      entries.set(id, entry);
    }
    if (entry.leaseUntil <= now) return { snapshot: null, status: 'waiting', serverNow: now, phoneConnected: entry.phoneHash !== null && entry.phoneLeaseUntil > now, transport };
    return { ...publicRemoteState(entry, now), phoneConnected: entry.phoneHash !== null && entry.phoneLeaseUntil > now, transport };
  }
  if (op === 'command' && entry.leaseUntil <= now) throw new RemoteError(409);
  if (op === 'revoke') {
    entries.delete(id);
    return { revoked: true, transport };
  }
  if (op === 'phone-disconnect') {
    entries.set(id, { ...entry, phoneHash: null, phoneLeaseUntil: 0, phoneEnabled: false });
    return { disconnected: true, phoneConnected: false, transport };
  }
  if (op === 'phone-enable') {
    entries.set(id, { ...entry, phoneEnabled: true });
    return { enabled: true, phoneConnected: entry.phoneHash !== null && entry.phoneLeaseUntil > now, transport };
  }
  if (op === 'phone-leave') {
    if (phoneHash && entry.phoneHash === phoneHash) {
      entry = { ...entry, phoneHash: null, phoneLeaseUntil: 0 };
      entries.set(id, entry);
    }
    return { disconnected: true, phoneConnected: entry.phoneHash !== null && entry.phoneLeaseUntil > now, transport };
  }
  let next = entry;
  if (op === 'sync') {
    const sync = input as { snapshot: RemoteSnapshot; ack?: string };
    next = syncRemoteEntry(entry, sync.snapshot, sync.ack, now);
  } else if (op === 'command') {
    if (!phoneHash || entry.phoneHash !== phoneHash || entry.phoneLeaseUntil <= now) throw new RemoteError(409);
    next = commandRemoteEntry(entry, input as RemoteCommandPayload, now);
  }
  if (next !== entry) entries.set(id, next);
  if (op === 'command') return { accepted: true, command: next.pending, serverNow: now, phoneConnected: next.phoneHash !== null && next.phoneLeaseUntil > now, transport };
  return { ...publicRemoteState(next, now), ...(op === 'sync' ? { command: pendingRemoteCommand(next, now), consumedVersion: next.lastCommandVersion } : {}), phoneConnected: next.phoneHash !== null && next.phoneLeaseUntil > now, transport };
}

export const readTimerRemote = (id: string, control: string, phoneId?: string) => operate('read', id, control, undefined, phoneId);
export const syncTimerRemote = (id: string, owner: string, snapshot: RemoteSnapshot, ack?: string) => operate('sync', id, owner, { snapshot, ack });
export const commandTimerRemote = (id: string, control: string, command: RemoteCommandPayload, phoneId?: string) => operate('command', id, control, command, phoneId);
export const revokeTimerRemote = (id: string, owner: string) => operate('revoke', id, owner);
export const enableTimerRemotePhone = (id: string, owner: string) => operate('phone-enable', id, owner);
export const disconnectTimerRemotePhone = (id: string, owner: string) => operate('phone-disconnect', id, owner);
export const leaveTimerRemotePhone = (id: string, control: string, phoneId: string) => operate('phone-leave', id, control, undefined, phoneId);