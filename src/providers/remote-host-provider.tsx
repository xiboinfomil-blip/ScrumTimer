'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { RemoteAction, RemoteSnapshot } from '@/lib/remote/timer-remote';
import { useTimerRemote } from '@/hooks/remote/use-timer-remote';
import { RemotePairingDialog } from '@/components/remote/remote-pairing-dialog';
import { useTeam } from './team-provider';
import { usePathname } from 'next/navigation';

export type RemotePageSnapshot = Omit<RemoteSnapshot, 'version'>;
type RemotePageDispatch = (action: RemoteAction) => void;
interface RemotePageView { snapshot: RemotePageSnapshot; dispatch: RemotePageDispatch }
interface RemoteHostContextValue {
  remote: ReturnType<typeof useTimerRemote>;
  openPairing: () => void;
  registerPage: (view: RemotePageView) => () => void;
}

const RemoteHostContext = createContext<RemoteHostContextValue | null>(null);
const idleSnapshot: RemotePageSnapshot = {
  page: 'idle', speaker: '', nextSpeaker: '', teamName: '', activeId: null,
  participantPresent: false, participantMood: null, participantIndex: 0, participantCount: 0, canVote: false, canContinue: false,
  running: false, remaining: 0, deadline: 0, completed: 0, total: 0, blocked: true,
};

export function RemoteHostProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { activeTeamId, ready } = useTeam();
  const [view, setView] = useState<RemotePageView>({ snapshot: idleSnapshot, dispatch: () => {} });
  const viewRef = useRef(view);
  const generation = useRef(0);
  const [pairingOpen, setPairingOpen] = useState(false);
  const workflow = pathname === '/participants' || pathname === '/mood' || pathname === '/timer';
  const teamId = ready && workflow ? activeTeamId : null;
  const publish = useCallback((next: RemotePageView, token: number) => {
    if (token !== generation.current) return;
    viewRef.current = next;
    setView(next);
  }, []);
  const registerPage = useCallback((next: RemotePageView) => {
    const token = ++generation.current;
    publish(next, token);
    return () => {
      if (token !== generation.current) return;
      const idle = { snapshot: idleSnapshot, dispatch: () => {} };
      viewRef.current = idle;
      setView(idle);
    };
  }, [publish]);
  const dispatch = useCallback((action: RemoteAction) => viewRef.current.dispatch(action), []);
  const remote = useTimerRemote(teamId, { ...view.snapshot, blocked: view.snapshot.blocked || pairingOpen }, { dispatch });
  const openPairing = useCallback(() => setPairingOpen(true), []);
  const closePairing = useCallback(() => setPairingOpen(false), []);
  return <RemoteHostContext.Provider value={{ remote, openPairing, registerPage }}>
    {children}
    <RemotePairingDialog open={pairingOpen} onClose={closePairing} remote={remote} />
  </RemoteHostContext.Provider>;
}

export function useRemotePage(snapshot: RemotePageSnapshot, dispatch: RemotePageDispatch) {
  const context = useContext(RemoteHostContext);
  if (!context) throw new Error('RemoteHostProvider is missing.');
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const signature = JSON.stringify(snapshot);
  useEffect(() => context.registerPage({ snapshot, dispatch: action => dispatchRef.current(action) }), [context.registerPage, signature]);
}

export function useRemoteHost() {
  const context = useContext(RemoteHostContext);
  if (!context) throw new Error('RemoteHostProvider is missing.');
  return context;
}
