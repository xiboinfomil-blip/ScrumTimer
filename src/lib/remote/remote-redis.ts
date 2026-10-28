import 'server-only';
import { createClient } from '@redis/client';
import { RemoteError } from './timer-remote.ts';

const makeClient = (url: string) => createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 4000, reconnectStrategy: false } });
type Client = ReturnType<typeof makeClient>;
interface Connection { url: string; client: Client; ready: Promise<Client> }
const shared = globalThis as typeof globalThis & { __standupRemoteRedis?: Connection };

/** Prefer the explicitly configured REST adapter; never silently change stores. */
export function remoteRedisAdapter(): 'rest' | 'redis' | null {
  const { UPSTASH_REDIS_REST_URL: rest, UPSTASH_REDIS_REST_TOKEN: token, REDIS_URL: redis } = process.env;
  try {
    if (rest || token) {
      if (!rest || !token) throw new Error();
      const url = new URL(rest);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
      return 'rest';
    }
    if (redis) {
      const url = new URL(redis);
      if (!['redis:', 'rediss:'].includes(url.protocol) || !url.hostname || url.hash || url.search || !/^\/(?:\d+)?$/.test(url.pathname || '/')) throw new Error();
      return 'redis';
    }
    return null;
  } catch { throw new RemoteError(503, 'REMOTE_REDIS_CONFIG_INVALID'); }
}

/** Reuse one connection and coalesce cold-start connects; do not replay commands. */
export async function evalRemoteRedis(script: string, key: string, args: string[]): Promise<unknown> {
  const url = process.env.REDIS_URL!;
  let connection = shared.__standupRemoteRedis;
  if (connection && connection.url !== url) {
    if (connection.client.isOpen) connection.client.destroy();
    shared.__standupRemoteRedis = undefined;
    connection = undefined;
  }
  if (!connection) {
    const client = makeClient(url);
    // Never log connection errors: their messages may contain endpoint details.
    client.on('error', () => {});
    const created: Connection = { url, client, ready: client.connect().then(() => client) };
    shared.__standupRemoteRedis = connection = created;
    void created.ready.catch(() => { if (shared.__standupRemoteRedis === created) shared.__standupRemoteRedis = undefined; });
  }
  const current = connection;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      current.ready.then(client => client.eval(script, { keys: [key], arguments: args })),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('timeout')), 5000); }),
    ]);
  } catch {
    if (shared.__standupRemoteRedis === current) shared.__standupRemoteRedis = undefined;
    if (current.client.isOpen) current.client.destroy();
    throw new RemoteError(503, 'REMOTE_REDIS_UNAVAILABLE');
  } finally { clearTimeout(timeout); }
}