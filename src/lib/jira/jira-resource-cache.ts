export type JiraResourceResult<T = unknown> = { data?: T; error?: string; status?: number };
type Entry = { expires: number; refresh?: boolean; result?: JiraResourceResult; pending?: Promise<JiraResourceResult> };

export class JiraResourceCache {
  private entries = new Map<string, Entry>();

  clear() { this.entries.clear(); }

  invalidate(url: string, teamId?: string | null) {
    const key = JSON.stringify([teamId ?? '', url]);
    const entry = this.entries.get(key);
    if (!entry?.pending) this.entries.set(key, { expires: 0, refresh: true });
  }

  async read<T>(url: string, teamId?: string | null, refresh = false, request: typeof fetch = fetch, now = Date.now): Promise<JiraResourceResult<T>> {
    const key = JSON.stringify([teamId ?? '', url]);
    const existing = this.entries.get(key);
    if (existing?.pending) return existing.pending as Promise<JiraResourceResult<T>>;
    refresh ||= existing?.refresh === true;
    if (!refresh && existing?.result && existing.expires > now()) return existing.result as JiraResourceResult<T>;
    const entry: Entry = { expires: 0 };
    const pending = (async (): Promise<JiraResourceResult> => {
      try {
        const response = await request(url, { cache: 'no-store', headers: { ...(teamId ? { 'X-Team-Id': teamId } : {}), ...(refresh ? { 'X-Jira-Refresh': '1' } : {}) }, signal: AbortSignal.timeout(60_000) });
        const body = await response.json();
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) this.clear();
          return { error: typeof body?.error === 'string' ? body.error : 'Jira est indisponible.', status: response.status };
        }
        const result = { data: body };
        if (this.entries.get(key) === entry) {
          entry.result = result;
          entry.expires = now() + (url.includes('action=tickets') ? 60_000 : 15_000);
        }
        return result;
      } catch (failure) {
        return { error: failure instanceof Error && failure.name === 'TimeoutError' ? 'Jira met trop de temps à répondre.' : 'Connexion Jira indisponible.' };
      } finally {
        entry.pending = undefined;
        if (!entry.result && this.entries.get(key) === entry) this.entries.delete(key);
      }
    })();
    entry.pending = pending;
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > 64) this.entries.delete(this.entries.keys().next().value!);
    return pending as Promise<JiraResourceResult<T>>;
  }
}

export const jiraResourceCache = new JiraResourceCache();