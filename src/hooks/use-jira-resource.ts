'use client';

import { useEffect, useState } from 'react';
import { jiraResourceCache, type JiraResourceResult } from '@/lib/jira-resource-cache';

export function useJiraResource<T>(url: string | null, teamId?: string | null) {
  const [reload, setReload] = useState(0);
  const key = `${url ?? ''}|${teamId ?? ''}|${reload}`;
  const [result, setResult] = useState<JiraResourceResult<T> & { key: string }>();
  useEffect(() => {
    if (!url) return;
    let active = true;
    void jiraResourceCache.read<T>(url, teamId).then(value => {
      if (active) setResult({ key, ...value });
    });
    return () => { active = false; };
  }, [key, reload, teamId, url]);
  return { data: result?.key === key ? result.data : undefined, error: result?.key === key ? result.error : undefined, status: result?.key === key ? result.status : undefined, loading: !!url && result?.key !== key, retry: () => { if (url) jiraResourceCache.invalidate(url, teamId); setReload(value => value + 1); } };
}