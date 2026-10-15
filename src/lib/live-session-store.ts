import 'server-only';
import { randomUUID } from 'node:crypto';
import type { LiveSnapshot } from './live-session';

interface Entry { owner: string; snapshot: LiveSnapshot; expires: number }
const entries = new Map<string, Entry>();
const ttl = 15_000;
const url = () => process.env.UPSTASH_REDIS_REST_URL;
export const liveTransport = () => url() && process.env.UPSTASH_REDIS_REST_TOKEN ? 'shared' : 'instance';
async function redis(...command: (string | number)[]) {
  const endpoint = url()!;
  if (!endpoint.startsWith('https://')) throw new Error('Redis HTTPS requis.');
  const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Diffusion indisponible.');
  const body = await response.json();
  if (body.error) throw new Error('Diffusion indisponible.');
  return body.result;
}
export async function readLive(team: string): Promise<LiveSnapshot | null> {
  if (liveTransport() === 'shared') {
    const raw = await redis('GET', `standup:live:${team}`);
    return raw ? (JSON.parse(raw) as Entry).snapshot : null;
  }
  for (const [key, entry] of entries) if (entry.expires <= Date.now()) entries.delete(key);
  return entries.get(team)?.snapshot ?? null;
}
export async function publishLive(team: string, owner: string | null, snapshot: LiveSnapshot) {
  const token = owner ?? randomUUID();
  const entry: Entry = { owner: token, snapshot, expires: Date.now() + ttl };
  if (liveTransport() === 'shared') {
    const script = "local old=redis.call('GET',KEYS[1]); if old and cjson.decode(old).owner~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'PX',ARGV[3]); return 1";
    if (!await redis('EVAL', script, 1, `standup:live:${team}`, token, JSON.stringify(entry), ttl)) return null;
  } else {
    await readLive(team);
    const old = entries.get(team);
    if (old && old.owner !== token) return null;
    entries.set(team, entry);
  }
  return token;
}
export async function stopLive(team: string, owner: string) {
  if (liveTransport() === 'shared') {
    await redis('EVAL', "local old=redis.call('GET',KEYS[1]); if old and cjson.decode(old).owner==ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0", 1, `standup:live:${team}`, owner);
  } else if (entries.get(team)?.owner === owner) entries.delete(team);
}