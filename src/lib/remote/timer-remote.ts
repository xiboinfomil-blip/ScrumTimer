import type { Mood } from '@/types/team';

/** Pure wire contracts and state transitions; no browser, database or transport dependencies. */
export interface RemoteSnapshot {
  page: 'participants' | 'mood' | 'timer' | 'idle';
  speaker: string;
  nextSpeaker: string;
  teamName: string;
  activeId: string | null;
  participants: RemoteParticipant[];
  participantPresent: boolean;
  participantMood: Mood | null;
  participantIndex: number;
  participantCount: number;
  canVote: boolean;
  canPostpone: boolean;
  canContinue: boolean;
  running: boolean;
  remaining: number;
  deadline: number;
  completed: number;
  total: number;
  version: string;
  blocked: boolean;
  blackScreen?: boolean;
  manualPenalty?: number;
}

export interface RemoteParticipant {
  name: string;
  present: boolean;
  mood: Mood | null;
  done: boolean;
  postponed: boolean;
  active: boolean;
}

export interface RemoteCommand {
  id: string;
  action: RemoteAction;
  targetIndex?: number;
  version: string;
  createdAt: number;
}

export type RemoteAction = 'start' | 'pause' | 'next' | 'restart' | 'penalty' | 'black-screen'
  | 'participant-previous' | 'participant-next' | 'attendance-toggle' | 'participant-continue'
  | 'mood-1' | 'mood-2' | 'mood-3' | 'mood-4' | 'mood-postpone' | 'mood-continue';

export type RemoteCommandPayload = Pick<RemoteCommand, 'action' | 'targetIndex' | 'version'> & { requestId: string };
export type RemoteTransport = 'shared' | 'instance';
export type RemoteStatus = 'waiting' | 'online' | 'stale';
export const REMOTE_PAIR_TTL = 4 * 60 * 60 * 1000;
export const REMOTE_HOST_LEASE = 10_000;
export const REMOTE_HOST_FRESH = 6_000;
export const REMOTE_PHONE_LEASE = 15_000;
export const REMOTE_COMMAND_TTL = 5_000;
export const REMOTE_MAX_ENTRIES = 512;
export const REMOTE_MAX_BODY_BYTES = 32_768;

/** Only hashes of bearer capabilities belong in transport state. */
export interface RemoteEntry {
  teamId: string;
  ownerHash: string;
  controlHash: string;
  expiresAt: number;
  hostSeenAt: number | null;
  leaseUntil: number;
  phoneHash: string | null;
  phoneLeaseUntil: number;
  phoneEnabled: boolean;
  snapshot: RemoteSnapshot | null;
  pending: RemoteCommand | null;
  lastCommandId: string | null;
  lastCommandVersion: string | null;
}

export class RemoteError extends Error {
  status: 400 | 401 | 404 | 409 | 503;
  code?: 'REMOTE_SECRET_INVALID' | 'REMOTE_REDIS_REQUIRED' | 'REMOTE_REDIS_CONFIG_INVALID' | 'REMOTE_REDIS_UNAVAILABLE' | 'REMOTE_PHONE_IN_USE' | 'REMOTE_PHONE_DISCONNECTED';
  constructor(status: RemoteError['status'], code?: RemoteError['code']) {
    super('Télécommande indisponible.');
    this.name = 'RemoteError';
    this.status = status;
    this.code = code;
  }
}

export function remoteObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RemoteError(400);
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !keys.includes(key))) throw new RemoteError(400);
  return data;
}

export function isRemoteToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function validateRemoteId(value: unknown): string {
  if (!isRemoteToken(value)) throw new RemoteError(400);
  return value;
}

export function remoteBearer(value: string | null): string {
  if (!value?.startsWith('Bearer ') || !isRemoteToken(value.slice(7))) throw new RemoteError(401);
  return value.slice(7);
}

function text(value: unknown, maximum: number, empty = true): value is string {
  return typeof value === 'string' && value.length <= maximum && (empty || value.trim().length > 0)
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function version(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function validateRemoteSnapshot(value: unknown): RemoteSnapshot {
  const data = remoteObject(value, ['page', 'speaker', 'nextSpeaker', 'teamName', 'activeId', 'participants', 'participantPresent', 'participantMood', 'participantIndex', 'participantCount', 'canVote', 'canPostpone', 'canContinue', 'running', 'remaining', 'deadline', 'completed', 'total', 'version', 'blocked', 'blackScreen', 'manualPenalty']);
  const participants = Array.isArray(data.participants) ? data.participants : null;
  const validParticipants = participants?.every(person => {
    if (!person || typeof person !== 'object' || Array.isArray(person)) return false;
    const item = person as Record<string, unknown>;
    return Object.keys(item).length === 6
      && Object.keys(item).every(key => ['name', 'present', 'mood', 'done', 'postponed', 'active'].includes(key))
      && text(item.name, 100, false)
      && typeof item.present === 'boolean'
      && (item.mood === null || [1, 2, 3, 4].includes(item.mood as number))
      && typeof item.done === 'boolean'
      && typeof item.postponed === 'boolean'
      && typeof item.active === 'boolean';
  }) ?? false;
  if ((data.blackScreen !== undefined && typeof data.blackScreen !== 'boolean') || (data.manualPenalty !== undefined && (!finite(data.manualPenalty) || !Number.isInteger(data.manualPenalty) || data.manualPenalty < 0 || data.manualPenalty > 1_000_000))) throw new RemoteError(400);
  if (!['participants', 'mood', 'timer', 'idle'].includes(data.page as string)
    || !text(data.speaker, 100) || !text(data.nextSpeaker, 100) || !text(data.teamName, 100)
    || !(data.activeId === null || text(data.activeId, 128, false))
    || !participants || participants.length > 100 || !validParticipants
    || typeof data.participantPresent !== 'boolean'
    || !(data.participantMood === null || [1, 2, 3, 4].includes(data.participantMood as number))
    || !Number.isInteger(data.participantIndex) || (data.participantIndex as number) < 0 || (data.participantIndex as number) > 99
    || !Number.isInteger(data.participantCount) || (data.participantCount as number) < 0 || (data.participantCount as number) > 100
    || typeof data.canVote !== 'boolean'
    || typeof data.canPostpone !== 'boolean'
    || typeof data.canContinue !== 'boolean'
    || data.participantCount !== participants.length
    || (data.activeId !== null && ((participants[data.participantIndex as number] as Record<string, unknown> | undefined)?.active !== true
      || participants.filter(person => (person as Record<string, unknown>).active === true).length !== 1))
    || (data.activeId === null && participants.some(person => (person as Record<string, unknown>).active === true))
    || ((data.page === 'participants' || data.page === 'mood') && (data.participantCount === 0
      ? data.activeId !== null || data.participantIndex !== 0
      : data.activeId === null || (data.participantIndex as number) >= (data.participantCount as number)))
    || typeof data.running !== 'boolean' || typeof data.blocked !== 'boolean' || !version(data.version)
    || !finite(data.remaining) || Math.abs(data.remaining) > 86_400
    || !finite(data.deadline) || data.deadline < 0 || data.deadline > Number.MAX_SAFE_INTEGER
    || !finite(data.completed) || !Number.isInteger(data.completed) || data.completed < 0
    || !finite(data.total) || !Number.isInteger(data.total) || data.total < data.completed || data.total > 1_000
    || (data.page === 'timer' && data.activeId !== null && data.completed >= data.total)
    || (data.page === 'timer' && data.running && (data.activeId === null || data.blocked))
    || (data.page !== 'timer' && data.running)) throw new RemoteError(400);
  return { ...data } as unknown as RemoteSnapshot;
}

export function validateRemoteRequestId(value: unknown): string {
  // crypto.randomUUID() (v4), not a caller-supplied timestamp or sequence number.
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new RemoteError(400);
  return value.toLowerCase();
}

export function validateRemoteCommand(value: unknown): RemoteCommandPayload {
  const data = remoteObject(value, ['requestId', 'action', 'targetIndex', 'version']);
  const requestId = validateRemoteRequestId(data.requestId);
  if (!version(data.version) || !['start', 'pause', 'next', 'restart', 'penalty', 'black-screen', 'participant-previous', 'participant-next', 'attendance-toggle', 'participant-continue', 'mood-1', 'mood-2', 'mood-3', 'mood-4', 'mood-postpone', 'mood-continue'].includes(data.action as string)) throw new RemoteError(400);
  const targetsPerson = data.action === 'attendance-toggle' || /^mood-[1-4]$/.test(data.action as string) || data.action === 'mood-postpone';
  if (targetsPerson ? !Number.isInteger(data.targetIndex) || (data.targetIndex as number) < 0 || (data.targetIndex as number) > 99 : data.targetIndex !== undefined) throw new RemoteError(400);
  return { requestId, action: data.action as RemoteCommand['action'], version: data.version,
    ...(targetsPerson ? { targetIndex: data.targetIndex as number } : {}) };
}

export type RemotePost = { operation: 'create' }
  | { operation: 'sync'; id: string; snapshot: RemoteSnapshot; ack?: string }
  | { operation: 'command'; id: string; command: RemoteCommandPayload }
  | { operation: 'phone-enable' | 'phone-disconnect' | 'phone-leave'; id: string };

export function validateRemotePost(value: unknown): RemotePost {
  const data = remoteObject(value, ['operation', 'id', 'snapshot', 'ack', 'command']);
  if (data.operation === 'create') {
    remoteObject(value, ['operation']);
    return { operation: 'create' };
  }
  if (data.operation === 'sync') {
    remoteObject(value, ['operation', 'id', 'snapshot', 'ack']);
    return { operation: 'sync', id: validateRemoteId(data.id), snapshot: validateRemoteSnapshot(data.snapshot),
      ...(data.ack === undefined ? {} : { ack: validateRemoteRequestId(data.ack) }) };
  }
  if (data.operation === 'command') {
    remoteObject(value, ['operation', 'id', 'command']);
    return { operation: 'command', id: validateRemoteId(data.id), command: validateRemoteCommand(data.command) };
  }
  if (data.operation === 'phone-enable' || data.operation === 'phone-disconnect' || data.operation === 'phone-leave') {
    remoteObject(value, ['operation', 'id']);
    return { operation: data.operation, id: validateRemoteId(data.id) };
  }
  throw new RemoteError(400);
}

export function normalizeRemoteSnapshot(snapshot: RemoteSnapshot, now: number): RemoteSnapshot {
  return { ...snapshot, deadline: snapshot.running ? now + snapshot.remaining * 1_000 : 0 };
}

function validTargetIndex(snapshot: RemoteSnapshot, targetIndex: number | undefined): targetIndex is number {
  return Number.isInteger(targetIndex) && targetIndex! >= 0 && targetIndex! < snapshot.participants.length;
}

export function isCommandAllowed(snapshot: RemoteSnapshot | null, command: Pick<RemoteCommand, 'action' | 'targetIndex' | 'version'>): boolean {
  if (!snapshot || snapshot.blocked || snapshot.version !== command.version) return false;
  if (snapshot.page === 'participants') return command.action === 'participant-continue' ? snapshot.canContinue
    : command.action === 'attendance-toggle' ? validTargetIndex(snapshot, command.targetIndex)
      : Boolean(snapshot.activeId) && ['participant-previous', 'participant-next'].includes(command.action) && snapshot.participantCount > 1;
  if (snapshot.page === 'mood') return command.action === 'mood-continue' ? snapshot.canContinue
    : Boolean(snapshot.activeId) && (['participant-previous', 'participant-next'].includes(command.action)
      ? snapshot.participantCount > 1
      : validTargetIndex(snapshot, command.targetIndex)
        && snapshot.participants[command.targetIndex!].present && snapshot.canVote
        && (/^mood-[1-4]$/.test(command.action) || (command.action === 'mood-postpone' && snapshot.canPostpone)));
  if (snapshot.page !== 'timer' || !snapshot.activeId || snapshot.completed >= snapshot.total) return false;
  if (snapshot.blackScreen) return command.action === 'black-screen';
  switch (command.action) {
    case 'start': return !snapshot.running;
    case 'pause': return snapshot.running;
    case 'next': return true;
    case 'restart': return true;
    case 'penalty': return (snapshot.manualPenalty ?? 0) <= 999_950;
    case 'black-screen': return true;
    default: return false;
  }
}

export function remoteStatus(entry: RemoteEntry, now: number): RemoteStatus {
  if (entry.hostSeenAt === null || !entry.snapshot) return 'waiting';
  return now <= entry.leaseUntil && now - entry.hostSeenAt <= REMOTE_HOST_FRESH ? 'online' : 'stale';
}

export function pendingRemoteCommand(entry: RemoteEntry, now: number): RemoteCommand | null {
  return entry.pending && now >= entry.pending.createdAt && now - entry.pending.createdAt <= REMOTE_COMMAND_TTL
    ? { ...entry.pending } : null;
}

export function authorizeRemote(entry: RemoteEntry | null, hash: string, role: 'owner' | 'control', now: number): RemoteEntry {
  if (!entry || entry.expiresAt <= now) throw new RemoteError(404);
  if (entry[role === 'owner' ? 'ownerHash' : 'controlHash'] !== hash) throw new RemoteError(401);
  return entry;
}

export function syncRemoteEntry(entry: RemoteEntry, snapshot: RemoteSnapshot, ack: string | undefined, now: number): RemoteEntry {
  const pending = pendingRemoteCommand(entry, now);
  return { ...entry, snapshot: normalizeRemoteSnapshot(snapshot, now), hostSeenAt: now,
    leaseUntil: Math.min(entry.expiresAt, now + REMOTE_HOST_LEASE),
    pending: pending?.id === ack ? null : pending };
}

export function commandRemoteEntry(entry: RemoteEntry, payload: RemoteCommandPayload, now: number): RemoteEntry {
  if (remoteStatus(entry, now) !== 'online' || !isCommandAllowed(entry.snapshot, payload)) throw new RemoteError(409);
  if (pendingRemoteCommand(entry, now) || entry.lastCommandId === payload.requestId || entry.lastCommandVersion === payload.version) throw new RemoteError(409);
  const command: RemoteCommand = { id: payload.requestId, action: payload.action, version: payload.version, createdAt: now,
    ...(payload.targetIndex === undefined ? {} : { targetIndex: payload.targetIndex }) };
  return { ...entry, pending: command, lastCommandId: command.id, lastCommandVersion: command.version };
}

export function publicRemoteState(entry: RemoteEntry, now: number) {
  return { snapshot: entry.snapshot ? { ...entry.snapshot } : null, status: remoteStatus(entry, now), serverNow: now };
}