'use client';

import { useEffect, useState } from 'react';

export function useJiraResource<T>(url: string | null, teamId?: string | null) {
  const [reload, setReload] = useState(0);
  const key = `${url ?? ''}|${teamId ?? ''}|${reload}`;
  const [result, setResult] = useState<{ key: string; data?: T; error?: string; status?: number }>();
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(url, { cache: 'no-store', headers: teamId ? { 'X-Team-Id': teamId } : {}, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]) });
        const body = await response.json();
        if (!controller.signal.aborted) setResult(response.ok ? { key, data: body as T } : { key, error: typeof body.error === 'string' ? body.error : 'Jira est indisponible.', status: response.status });
      } catch (failure) {
        if (!controller.signal.aborted) setResult({ key, error: failure instanceof Error && failure.name === 'TimeoutError' ? 'Jira met trop de temps à répondre.' : 'Connexion Jira indisponible.' });
      }
    })();
    return () => controller.abort();
  }, [key, teamId, url]);
  return { data: result?.key === key ? result.data : undefined, error: result?.key === key ? result.error : undefined, status: result?.key === key ? result.status : undefined, loading: !!url && result?.key !== key, retry: () => setReload(value => value + 1) };
}