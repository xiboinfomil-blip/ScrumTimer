'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { TeamState } from '@/types/team';
import { defaultTeam, normalizeTeam, readTeam, STORAGE_KEY } from '@/lib/team-storage';
import { HISTORY_KEY, normalizeHistory, readHistory, type HistoryRound } from '@/lib/history';

interface TeamContextValue {
  state: TeamState;
  ready: boolean;
  persistent: boolean;
  cloudStatus: 'loading' | 'local' | 'saved' | 'saving' | 'error';
  retryCloud: () => void;
  saveRound: (round: HistoryRound) => void;
  updateTeam: (update: (current: TeamState) => TeamState) => void;
}

const TeamContext = createContext<TeamContextValue | null>(null);

export function TeamProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(defaultTeam);
  const [ready, setReady] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [cloudStatus, setCloudStatus] = useState<TeamContextValue['cloudStatus']>('loading');
  const [retry, setRetry] = useState(0);
  const revision = useRef(0);
  const enabled = useRef(false);
  const latest = useRef(state);
  const changed = useRef(false);
  const uploading = useRef(false);
  const memoryHistory = useRef<HistoryRound[]>([]);
  const historyQueue = useRef<Promise<void>>(Promise.resolve());
  const uploadHistory = useCallback((rounds: HistoryRound[]) => {
    historyQueue.current = historyQueue.current.then(async () => {
      for (const round of rounds) {
        const response = await fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(round), signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('history save');
      }
    }).catch(() => setCloudStatus('error'));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let local = defaultTeam();
    try {
      local = readTeam(localStorage); memoryHistory.current = readHistory(localStorage);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(memoryHistory.current));
    }
    catch { setPersistent(false); }
    if (!changed.current) { latest.current = local; setState(local); }
    const timeout = setTimeout(() => controller.abort(), 10000);
    void (async () => {
      try {
        const response = await fetch('/api/team', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) { setCloudStatus(response.status === 503 ? 'local' : 'error'); return; }
        const saved = await response.json();
        if (cancelled) return;
        revision.current = saved.revision;
        let pending = false;
        try { pending = localStorage.getItem('standup.cloud.pending') === 'true'; } catch { /* memory fallback */ }
        if (saved.team && !changed.current && !pending) {
          // Keep same-device setup, but let the database restore saved profiles/preferences.
          const restored = normalizeTeam({ ...saved.team, session: local.session, currentMoodSlide: local.currentMoodSlide });
          latest.current = restored; setState(restored);
        }
        enabled.current = true; setCloudStatus('saving');
      } catch { if (!controller.signal.aborted || !cancelled) setCloudStatus('error'); }
      finally { clearTimeout(timeout); if (!cancelled) setReady(true); }
    })();
    return () => { cancelled = true; clearTimeout(timeout); controller.abort(); };
  }, [retry]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); setPersistent(true); }
    catch { setPersistent(false); }
  }, [state, ready]);
  useEffect(() => {
    if (!ready || !enabled.current) return;
    const timeout = setTimeout(async () => {
      if (uploading.current) return;
      uploading.current = true;
      setCloudStatus('saving');
      try {
        // Serialize writes, then flush changes made while a request was in flight.
        let snapshot: TeamState;
        do {
          snapshot = latest.current;
          const response = await fetch('/api/team', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team: snapshot, revision: revision.current }), signal: AbortSignal.timeout(15000) });
          if (!response.ok) { if (response.status === 409) enabled.current = false; throw new Error('team save'); }
          revision.current = (await response.json()).revision;
        } while (snapshot !== latest.current);
        changed.current = false;
        try { localStorage.removeItem('standup.cloud.pending'); } catch { /* memory fallback */ }
        setCloudStatus('saved');
        uploadHistory(normalizeHistory(memoryHistory.current));
      } catch { setCloudStatus('error'); }
      finally { uploading.current = false; }
    }, 500);
    return () => clearTimeout(timeout);
  }, [state, ready, retry, uploadHistory]);
  const updateTeam = useCallback((update: (current: TeamState) => TeamState) => {
    const next = update(latest.current);
    latest.current = next; changed.current = true; setState(next);
    try { localStorage.setItem('standup.cloud.pending', 'true'); } catch { /* memory fallback */ }
  }, []);
  const saveRound = useCallback((round: HistoryRound) => {
    memoryHistory.current = normalizeHistory([round, ...memoryHistory.current]);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(memoryHistory.current)); }
    catch { setPersistent(false); }
    if (enabled.current && revision.current > 0) uploadHistory([round]);
  }, [uploadHistory]);
  const retryCloud = useCallback(() => { enabled.current = false; setReady(false); setCloudStatus('loading'); setRetry(value => value + 1); }, []);
  return <TeamContext.Provider value={{ state, ready, persistent, cloudStatus, retryCloud, saveRound, updateTeam }}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
}