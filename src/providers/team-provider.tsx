'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { TeamState } from '@/types/team';
import { defaultTeam, normalizeTeam } from '@/lib/team-storage';
import { normalizeHistory, type HistoryRound } from '@/lib/history';

interface TeamContextValue {
  state: TeamState;
  ready: boolean;
  cloudStatus: 'loading' | 'saved' | 'saving' | 'error';
  retryCloud: () => void;
  saveRound: (round: HistoryRound) => void;
  updateTeam: (update: (current: TeamState) => TeamState) => void;
}

const TeamContext = createContext<TeamContextValue | null>(null);

export function TeamProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(defaultTeam);
  const [ready, setReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<TeamContextValue['cloudStatus']>('loading');
  const [retry, setRetry] = useState(0);
  const revision = useRef(0);
  const latest = useRef(state);
  const hydrated = useRef(false);
  const dirty = useRef(false);
  const uploading = useRef(false);
  const conflict = useRef(false);
  const pendingRounds = useRef<HistoryRound[]>([]);

  const flush = useCallback(async () => {
    if (!hydrated.current || uploading.current || conflict.current) return;
    uploading.current = true;
    setCloudStatus('saving');
    try {
      while (dirty.current || pendingRounds.current.length) {
        if (dirty.current) {
          const snapshot = latest.current;
          const response = await fetch('/api/team', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team: snapshot, revision: revision.current }), signal: AbortSignal.timeout(15000) });
          if (!response.ok) { conflict.current = response.status === 409; throw new Error('team save'); }
          revision.current = (await response.json()).revision;
          dirty.current = snapshot !== latest.current;
        } else {
          const round = pendingRounds.current[0];
          const response = await fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(round), signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw new Error('history save');
          pendingRounds.current = pendingRounds.current.filter(item => item.id !== round.id);
        }
      }
      setCloudStatus('saved');
    } catch { setCloudStatus('error'); }
    finally { uploading.current = false; }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const timeout = setTimeout(() => controller.abort(), 15000);
    void (async () => {
      try {
        const response = await fetch('/api/team', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('team load');
        const saved = await response.json();
        if (cancelled) return;
        revision.current = saved.revision;
        latest.current = normalizeTeam(saved.team);
        setState(latest.current);
        hydrated.current = true;
        dirty.current = !saved.team;
        setReady(true);
        if (dirty.current || pendingRounds.current.length) void flush();
        else setCloudStatus('saved');
      } catch { if (!cancelled) setCloudStatus('error'); }
      finally { clearTimeout(timeout); }
    })();
    return () => { cancelled = true; clearTimeout(timeout); controller.abort(); };
  }, [retry, flush]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current && !pendingRounds.current.length) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  const updateTeam = useCallback((update: (current: TeamState) => TeamState) => {
    if (!hydrated.current || conflict.current) return;
    latest.current = update(latest.current);
    dirty.current = true;
    setState(latest.current);
    void flush();
  }, [flush]);
  const saveRound = useCallback((round: HistoryRound) => {
    pendingRounds.current = normalizeHistory([round, ...pendingRounds.current]);
    void flush();
  }, [flush]);
  const retryCloud = useCallback(() => {
    if (conflict.current) {
      conflict.current = false; hydrated.current = false; dirty.current = false;
      setReady(false); setCloudStatus('loading'); setRetry(value => value + 1);
    } else if (hydrated.current) void flush();
    else { setCloudStatus('loading'); setRetry(value => value + 1); }
  }, [flush]);
  return <TeamContext.Provider value={{ state, ready, cloudStatus, retryCloud, saveRound, updateTeam }}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
}