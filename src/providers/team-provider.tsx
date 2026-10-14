'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { TeamState } from '@/types/team';
import { defaultTeam, readTeam, STORAGE_KEY } from '@/lib/team-storage';

interface TeamContextValue {
  state: TeamState;
  ready: boolean;
  persistent: boolean;
  updateTeam: (update: (current: TeamState) => TeamState) => void;
}

const TeamContext = createContext<TeamContextValue | null>(null);

export function TeamProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(defaultTeam);
  const [ready, setReady] = useState(false);
  const [persistent, setPersistent] = useState(true);
  useEffect(() => {
    try { setState(readTeam(localStorage)); }
    catch { setPersistent(false); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); setPersistent(true); }
    catch { setPersistent(false); }
  }, [state, ready]);
  const updateTeam = useCallback((update: (current: TeamState) => TeamState) => setState(update), []);
  return <TeamContext.Provider value={{ state, ready, persistent, updateTeam }}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
}