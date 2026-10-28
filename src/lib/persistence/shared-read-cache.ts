/** Bounded process-local read cache. Never stores rejected loads or serves expired data. */
export class SharedReadCache {
  private entries = new Map<string, { expires: number; value: unknown }>();
  private pending = new Map<string, Promise<unknown>>();
  private generation = 0;
  private mutations = 0;

  private readonly limit: number;
  private readonly clock: () => number;

  constructor(limit = 256, clock = Date.now) {
    this.limit = limit;
    this.clock = clock;
  }

  async read<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    if (this.mutations) return load();
    const hit = this.entries.get(key);
    if (hit && hit.expires > this.clock()) return structuredClone(hit.value) as T;
    this.entries.delete(key);
    const existing = this.pending.get(key);
    if (existing) return structuredClone(await existing) as T;
    const generation = this.generation;
    const started = this.clock();
    const work = Promise.resolve().then(load);
    this.pending.set(key, work);
    try {
      const value = await work;
      if (value !== null && value !== undefined && generation === this.generation && !this.mutations && started + ttl > this.clock()) {
        if (this.entries.size >= this.limit) this.entries.delete(this.entries.keys().next().value!);
        this.entries.set(key, { value: structuredClone(value), expires: started + ttl });
      }
      return structuredClone(value);
    } finally {
      if (this.pending.get(key) === work) this.pending.delete(key);
    }
  }

  private invalidate() {
    this.generation++;
    this.entries.clear();
    this.pending.clear();
  }

  async mutate<T>(write: () => Promise<T>): Promise<T> {
    this.mutations++;
    this.invalidate();
    try { return await write(); }
    finally { this.mutations--; this.invalidate(); }
  }
}

// Shared by all requests in this server instance, never by browser storage.
// globalThis also shares the cache across separately compiled route modules.
const shared = globalThis as typeof globalThis & {
  scrumReadCaches?: { team: SharedReadCache; public: SharedReadCache };
};
shared.scrumReadCaches ??= { team: new SharedReadCache(), public: new SharedReadCache(64) };
export const teamReadCache = shared.scrumReadCaches.team;
export const publicReadCache = shared.scrumReadCaches.public;

/** Daily check-ins use Mauritius days; retained history uses UTC days. */
export function teamReadKey(resource: string, teamId = '', now = new Date()) {
  const mauritius = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `${resource}:${teamId}:${now.toISOString().slice(0, 10)}:${mauritius}`;
}