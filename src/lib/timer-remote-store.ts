import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { authorizeTimerRemoteControl, timerRemoteAccess, timerRemoteSecret, timerRemoteTeamId } from './timer-remote-access.ts';
import {
  authorizeRemote, commandRemoteEntry, pendingRemoteCommand, publicRemoteState, RemoteError,
  REMOTE_COMMAND_TTL, REMOTE_HOST_FRESH, REMOTE_HOST_LEASE, REMOTE_MAX_ENTRIES, REMOTE_PAIR_TTL, syncRemoteEntry,
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
  if op=='read' then return cjson.encode({snapshot=cjson.null,status='waiting',serverNow=now}) end
  if op=='command' then return cjson.encode({error=409}) end
  return cjson.encode({error=401})
end
local raw=redis.call('GET',KEYS[1])
if not raw then return missing() end
local e=cjson.decode(raw)
if e.expiresAt<=now then redis.call('DEL',KEYS[1]); return missing() end
local expected=e.controlHash
if op=='sync' or op=='revoke' then expected=e.ownerHash end
if expected~=ARGV[2] then return cjson.encode({error=401}) end
if op=='revoke' then redis.call('DEL',KEYS[1]); return cjson.encode({revoked=true}) end
local function has(v) return v~=nil and v~=cjson.null end
local function pending()
  if has(e.pending) and now>=e.pending.createdAt and now-e.pending.createdAt<=${REMOTE_COMMAND_TTL} then return e.pending end
  return cjson.null
end
local function status()
  if not has(e.hostSeenAt) or not has(e.snapshot) then return 'waiting' end
  if now<e.leaseUntil and now-e.hostSeenAt<=${REMOTE_HOST_FRESH} then return 'online' end
  return 'stale'
end
if op=='sync' then
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
  local s=e.snapshot
  if status()~='online' or not has(s) or s.blocked or not has(s.activeId) or s.activeId=='' or s.completed>=s.total or s.version~=input.version then return cjson.encode({error=409}) end
  if (input.action=='start' and s.running) or (input.action=='pause' and not s.running) then return cjson.encode({error=409}) end
  if s.blackScreen==true and input.action~='black-screen' then return cjson.encode({error=409}) end
  if input.action=='penalty' and (s.manualPenalty or 0)>999950 then return cjson.encode({error=409}) end
  if input.action~='start' and input.action~='pause' and input.action~='next' and input.action~='restart' and input.action~='penalty' and input.action~='black-screen' then return cjson.encode({error=409}) end
  if has(pending()) or e.lastCommandId==input.requestId or e.lastCommandVersion==input.version then return cjson.encode({error=409}) end
  e.pending={id=input.requestId,action=input.action,version=input.version,createdAt=now}
  e.lastCommandId=input.requestId
  e.lastCommandVersion=input.version
end
if op=='sync' or op=='command' then redis.call('SET',KEYS[1],cjson.encode(e),'KEEPTTL') end
if op=='command' then return cjson.encode({accepted=true,command=e.pending,serverNow=now}) end
local result={snapshot=e.snapshot,status=status(),serverNow=now}
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
    if (result.error === 401 || result.error === 404 || result.error === 409) throw new RemoteError(result.error);
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
    expiresAt: now + REMOTE_PAIR_TTL, hostSeenAt: null, leaseUntil: now + REMOTE_HOST_LEASE, snapshot: null,
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

type Operation = 'read' | 'sync' | 'command' | 'revoke';
async function operate(op: Operation, id: string, token: string, input?: { snapshot: RemoteSnapshot; ack?: string } | RemoteCommandPayload) {
  const isControl = op === 'read' || op === 'command';
  // Always verify against the current stable secret BEFORE trusting any stored hash.
  if (isControl) authorizeTimerRemoteControl(id, token, timerRemoteSecret(process.env));
  else timerRemoteTeamId(id);
  const transport = timerRemoteTransport();
  const hash = hashRemoteToken(token);
  if (transport === 'shared') return { ...await redisEval(operationScript, id, op, hash, JSON.stringify(input ?? {})), transport };
  // No await between lookup/auth/transition/write: atomic within this process, including HMR bundles.
  const now = Date.now();
  prune(now);
  const stored = entries.get(id);
  if (!stored) {
    if (op === 'read') return { snapshot: null, status: 'waiting', serverNow: now, transport };
    throw new RemoteError(op === 'command' ? 409 : 401);
  }
  const entry = authorizeRemote(stored, hash, isControl ? 'control' : 'owner', now);
  if (op === 'read' && entry.leaseUntil <= now) return { snapshot: null, status: 'waiting', serverNow: now, transport };
  if (op === 'command' && entry.leaseUntil <= now) throw new RemoteError(409);
  if (op === 'revoke') {
    entries.delete(id);
    return { revoked: true, transport };
  }
  let next = entry;
  if (op === 'sync') {
    const sync = input as { snapshot: RemoteSnapshot; ack?: string };
    next = syncRemoteEntry(entry, sync.snapshot, sync.ack, now);
  } else if (op === 'command') next = commandRemoteEntry(entry, input as RemoteCommandPayload, now);
  if (next !== entry) entries.set(id, next);
  if (op === 'command') return { accepted: true, command: next.pending, serverNow: now, transport };
  return { ...publicRemoteState(next, now), ...(op === 'sync' ? { command: pendingRemoteCommand(next, now), consumedVersion: next.lastCommandVersion } : {}), transport };
}

export const readTimerRemote = (id: string, control: string) => operate('read', id, control);
export const syncTimerRemote = (id: string, owner: string, snapshot: RemoteSnapshot, ack?: string) => operate('sync', id, owner, { snapshot, ack });
export const commandTimerRemote = (id: string, control: string, command: RemoteCommandPayload) => operate('command', id, control, command);
export const revokeTimerRemote = (id: string, owner: string) => operate('revoke', id, owner);