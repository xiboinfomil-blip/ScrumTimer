'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { RemoteAction, RemoteSnapshot } from '@/lib/remote/timer-remote';
import { useTimerRemote } from '@/hooks/remote/use-timer-remote';
import { RemotePairingDialog } from '@/components/remote/remote-pairing-dialog';
import { useTeam } from './team-provider';
import { usePathname } from 'next/navigation';

export type RemotePageSnapshot = Omit<RemoteSnapshot, 'version'>;
type RemotePageDispatch = (action: RemoteAction, targetIndex?: number) => void;
interface RemotePageView { snapshot: RemotePageSnapshot; dispatch: RemotePageDispatch; participantIds?: string[] }
interface SynchronizedList { key: string; ids: string[]; page: number; pages: number; changePage: (page: number) => void }
interface RemoteHostContextValue {
  remote: ReturnType<typeof useTimerRemote>;
  openPairing: () => void;
  closePairing: () => void;
  scheduleClosePairing: () => void;
  pairingOpen: boolean;
  registerPage: (view: RemotePageView) => () => void;
  registerList: (list: SynchronizedList) => () => void;
}

const RemoteHostContext = createContext<RemoteHostContextValue | null>(null);
const idleSnapshot: RemotePageSnapshot = {
  page: 'idle', speaker: '', nextSpeaker: '', teamName: '', activeId: null,
  participants: [], participantPresent: false, participantMood: null, participantIndex: 0, participantCount: 0, canVote: false, canPostpone: false, canContinue: false,
  running: false, remaining: 0, deadline: 0, completed: 0, total: 0, blocked: true,
};

export function RemoteHostProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { activeTeamId, ready } = useTeam();
  const [view, setView] = useState<RemotePageView>({ snapshot: idleSnapshot, dispatch: () => {} });
  const viewRef = useRef(view);
  const generation = useRef(0);
  const [lists, setLists] = useState<SynchronizedList[]>([]);
  const registerList = useCallback((list: SynchronizedList) => {
    setLists(current => [...current.filter(candidate => candidate.key !== list.key), list]);
    return () => setLists(current => current.filter(candidate => candidate !== list));
  }, []);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairingAnchor, setPairingAnchor] = useState<HTMLElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const sharedLists = lists.filter(list => list.ids.every(id => view.participantIds?.includes(id))).sort((first, second) => first.key.localeCompare(second.key));
  const dispatch = useCallback((action: RemoteAction, targetIndex?: number) => {
    if (action === 'list-previous' || action === 'list-next') {
      const list = sharedLists[targetIndex ?? -1];
      if (list) list.changePage(list.page + (action === 'list-next' ? 1 : -1));
    } else viewRef.current.dispatch(action, targetIndex);
  }, [sharedLists]);
  const remote = useTimerRemote(teamId, { ...view.snapshot, lists: sharedLists.map(list => ({ key: list.key, indices: list.ids.map(id => view.participantIds!.indexOf(id)), page: list.page, pages: list.pages })), blocked: view.snapshot.blocked || pairingOpen }, { dispatch });
  useEffect(() => { if (remote.phoneConnected) setPairingOpen(false); }, [remote.phoneConnected]);
  const openPairing = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setPairingAnchor(document.getElementById('remote-pairing-button'));
    setPairingOpen(true);
  }, []);
  const closePairing = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setPairingOpen(false);
  }, []);
  const scheduleClosePairing = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPairingOpen(false), 220);
  }, []);
  useEffect(() => {
    closePairing();
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, [pathname, activeTeamId, closePairing]);
  return <RemoteHostContext.Provider value={{ remote, openPairing, closePairing, scheduleClosePairing, pairingOpen, registerPage, registerList }}>
    {children}
    <RemotePairingDialog open={pairingOpen} anchorEl={pairingAnchor} onClose={closePairing} onEnter={openPairing} onLeave={scheduleClosePairing} remote={remote} />
  </RemoteHostContext.Provider>;
}

export function useRemotePage(snapshot: RemotePageSnapshot, dispatch: RemotePageDispatch, participantIds?: string[]) {
  const context = useContext(RemoteHostContext);
  if (!context) throw new Error('RemoteHostProvider is missing.');
  const { registerPage } = context;
  const dispatchRef = useRef(dispatch);
  const snapshotRef = useRef(snapshot);
  const participantIdsRef = useRef(participantIds);
  const signature = JSON.stringify([snapshot, participantIds]);
  useEffect(() => { dispatchRef.current = dispatch; }, [dispatch]);
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);
  useEffect(() => { participantIdsRef.current = participantIds; }, [participantIds]);
  useEffect(() => registerPage({ snapshot: snapshotRef.current, participantIds: participantIdsRef.current, dispatch: (action, targetIndex) => dispatchRef.current(action, targetIndex) }), [registerPage, signature]);
}

export function useSynchronizedList(list: SynchronizedList) {
  const registerList = useContext(RemoteHostContext)?.registerList;
  const signature = JSON.stringify([list.key, list.ids, list.page, list.pages]);
  const latest = useRef(list);
  useEffect(() => { latest.current = list; }, [list]);
  useEffect(() => {
    if (list.key && registerList) return registerList(latest.current);
  }, [registerList, signature, list.key]);
}

export function useRemoteHost() {
  const context = useContext(RemoteHostContext);
  if (!context) throw new Error('RemoteHostProvider is missing.');
  return context;
}
