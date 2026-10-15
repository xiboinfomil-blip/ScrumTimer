'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { TeamState } from '@/types/team';
import { defaultTeam, normalizeTeam } from '@/lib/team-storage';
import { normalizeHistory, type HistoryRound } from '@/lib/history';
import { validateHistoryInput, validateTeamInput } from '@/lib/team-validation';
import { useNotify } from '@/providers/notification-provider';
import { usePathname } from 'next/navigation';
import { resolveTeamContext, teamContextUrl } from '@/lib/team-context';

export interface TeamSummary {
  id: string;
  name: string;
  memberCount: number;
}

interface TeamList {
  teams: TeamSummary[];
  activeTeamId: string;
}

function readTeamList(value: unknown): TeamList {
  const list = value as TeamList | null;
  if (!list || !Array.isArray(list.teams) || typeof list.activeTeamId !== 'string'
    || !list.teams.every(team => typeof team.id === 'string' && typeof team.name === 'string'
      && Number.isInteger(team.memberCount) && team.memberCount >= 0)
    || !list.teams.some(team => team.id === list.activeTeamId)) throw new Error('Liste des équipes invalide.');
  return list;
}

interface TeamContextValue {
  teams: TeamSummary[];
  activeTeamId: string | null;
  activeTeamName: string;
  teamBusy: boolean;
  dailyReady: boolean;
  todayRound: HistoryRound | null;
  resetToday: () => Promise<boolean>;
  setDailyReady: (ready: boolean) => void;
  switchTeam: (id: string) => Promise<boolean>;
  createTeam: (name: string) => Promise<boolean>;
  state: TeamState;
  ready: boolean;
  cloudStatus: 'loading' | 'saved' | 'saving' | 'error';
  retryCloud: () => void;
  saveRound: (round: HistoryRound) => void;
  updateTeam: (update: (current: TeamState) => TeamState) => boolean;
}

const TeamContext = createContext<TeamContextValue | null>(null);

export function TeamProvider({ children }: { children: ReactNode }) {
  const notify = useNotify();
  const pathname = usePathname();
  const [state, setState] = useState(defaultTeam);
  const [ready, setReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<TeamContextValue['cloudStatus']>('loading');
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [teamBusy, setTeamBusy] = useState(true);
  const [dailyReady, setDailyReady] = useState(false);
  const [todayRound, setTodayRound] = useState<HistoryRound | null>(null);
  const [retry, setRetry] = useState(0);
  const selectedId = useRef<string | null>(null);
  const busy = useRef(true);
  const generation = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const writeController = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const latest = useRef(state);
  const hydrated = useRef(false);
  const dirty = useRef(false);
  const uploading = useRef(false);
  const conflict = useRef(false);
  const pendingRounds = useRef<HistoryRound[]>([]);

  useEffect(() => {
    if (!activeTeamId) return;
    const url = teamContextUrl(window.location.href, activeTeamId);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== url) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, [activeTeamId, pathname]);

  const flush = useCallback(async () => {
    const teamId = selectedId.current;
    if (!teamId || busy.current || !hydrated.current || uploading.current || conflict.current) return;
    const currentGeneration = generation.current;
    const controller = new AbortController();
    writeController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    uploading.current = true;
    setCloudStatus('saving');
    try {
      while (dirty.current || pendingRounds.current.length) {
        if (dirty.current) {
          const snapshot = latest.current;
          const response = await fetch('/api/team', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Team-Id': teamId }, body: JSON.stringify({ team: snapshot, revision: revision.current }), signal: controller.signal });
          if (!response.ok) { conflict.current = response.status === 409; throw new Error('team save'); }
          const saved = await response.json();
          if (generation.current !== currentGeneration || controller.signal.aborted) return;
          revision.current = saved.revision;
          dirty.current = snapshot !== latest.current;
        } else {
          const round = pendingRounds.current[0];
          const response = await fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Team-Id': teamId }, body: JSON.stringify(round), signal: controller.signal });
          if (response.status === 409) {
            const existing = await fetch('/api/history', { cache: 'no-store', headers: { 'X-Team-Id': teamId }, signal: controller.signal });
            if (!existing.ok) throw new Error('history reload');
            const history = await existing.json();
            if (generation.current !== currentGeneration || controller.signal.aborted) return;
            const winner = normalizeHistory(history.rounds).find(item => new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Mauritius' }).format(new Date(item.completedAt)) === history.day);
            if (!winner) throw new Error('daily result unavailable');
            setTodayRound(winner);
            pendingRounds.current = pendingRounds.current.filter(item => item.id !== round.id);
            notify('Ce point quotidien a déjà été terminé sur un autre appareil. Le bilan enregistré est affiché.', 'warning');
            continue;
          }
          if (!response.ok) throw new Error('history save');
          if (generation.current !== currentGeneration || controller.signal.aborted) return;
          setTodayRound(round);
          pendingRounds.current = pendingRounds.current.filter(item => item.id !== round.id);
        }
      }
      if (generation.current === currentGeneration) setCloudStatus('saved');
    } catch {
      if (generation.current === currentGeneration) {
        setCloudStatus('error');
        if (conflict.current) notify('Conflit de sauvegarde : changement d’équipe bloqué. Vos modifications restent en attente.', 'error');
      }
    } finally {
      clearTimeout(timeout);
      if (writeController.current === controller) writeController.current = null;
      uploading.current = false;
    }
  }, [notify]);

  const hydrateTeam = useCallback(async (teamId: string, controller: AbortController, token: number) => {
    const response = await fetch('/api/team', { cache: 'no-store', headers: { 'X-Team-Id': teamId }, signal: controller.signal });
    if (!response.ok) throw new Error('Chargement de l’équipe impossible.');
    const saved = await response.json();
    const historyResponse = await fetch('/api/history', { cache: 'no-store', headers: { 'X-Team-Id': teamId }, signal: controller.signal });
    if (!historyResponse.ok) throw new Error('Chargement du bilan du jour impossible.');
    const history = await historyResponse.json();
    if (generation.current !== token || controller.signal.aborted) return false;
    const day = history.day ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Mauritius' }).format(new Date());
    setTodayRound(normalizeHistory(history.rounds).find(round => new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Mauritius' }).format(new Date(round.completedAt)) === day) ?? null);
    revision.current = saved.revision;
    latest.current = normalizeTeam(saved.team);
    setState(latest.current);
    const memberCount = latest.current.roster.length;
    setTeams(current => current.map(team => team.id === teamId ? { ...team, memberCount } : team));
    hydrated.current = true;
    window.history.replaceState(window.history.state, '', teamContextUrl(window.location.href, teamId));
    dirty.current = !saved.team;
    setReady(true);
    setCloudStatus(dirty.current ? 'saving' : 'saved');
    return true;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadController.current = controller;
    const token = ++generation.current;
    busy.current = true;
    hydrated.current = false;
    setTeamBusy(true);
    setReady(false);
    const timeout = setTimeout(() => controller.abort(), 15000);
    void (async () => {
      try {
        const response = await fetch('/api/teams', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Liste des équipes indisponible.');
        const list = readTeamList(await response.json());
        if (generation.current !== token || controller.signal.aborted) return;
        setTeams(list.teams);
        const teamId = resolveTeamContext(list.teams.map(team => team.id), selectedId.current
          ?? new URL(window.location.href).searchParams.get('team'), list.activeTeamId);
        selectedId.current = teamId;
        setActiveTeamId(teamId);
        await hydrateTeam(teamId, controller, token);
      } catch {
        if (generation.current === token) {
          setCloudStatus('error');
          notify('Impossible de charger les équipes depuis Neon. Réessayez ; aucune équipe de remplacement n’est utilisée.', 'error');
        }
      } finally {
        clearTimeout(timeout);
        if (generation.current === token) {
          busy.current = false;
          setTeamBusy(false);
          if (hydrated.current && dirty.current) void flush();
        }
      }
    })();
    return () => { if (generation.current === token) generation.current = token + 1; clearTimeout(timeout); controller.abort(); loadController.current?.abort(); writeController.current?.abort(); };
  }, [retry, flush, hydrateTeam, notify]);

  const changeTeam = useCallback(async (method: 'PATCH' | 'POST', body: { teamId: string } | { name: string }) => {
    if (busy.current || uploading.current || dirty.current || pendingRounds.current.length || conflict.current) {
      notify(conflict.current ? 'Conflit de sauvegarde : changement d’équipe bloqué. Vos modifications restent en attente.'
        : 'Changement d’équipe indisponible : attendez la confirmation des sauvegardes, ou réessayez Neon.', 'error');
      return false;
    }
    if (!hydrated.current) { notify('Chargez votre équipe avant de changer d’équipe.', 'error'); return false; }
    busy.current = true;
    setTeamBusy(true);
    setDailyReady(false);
    setTodayRound(null);
    hydrated.current = false;
    setReady(false);
    setCloudStatus('loading');
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const token = ++generation.current;
    const timeout = setTimeout(() => controller.abort(), 15000);
    let selected = false;
    try {
      const response = await fetch('/api/teams', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      if (!response.ok) throw new Error('Le changement d’équipe a échoué. Réessayez Neon.');
      const list = readTeamList(await response.json());
      if (generation.current !== token || controller.signal.aborted) return false;
      selected = true;
      selectedId.current = list.activeTeamId;
      // Hide the previous guarded route before a newly created empty team hydrates.
      if (method === 'POST') window.history.replaceState(window.history.state, '', `/manage-team?team=${list.activeTeamId}`);
      setTeams(list.teams);
      setActiveTeamId(list.activeTeamId);
      setState(defaultTeam());
      return await hydrateTeam(list.activeTeamId, controller, token);
    } catch (error) {
      if (generation.current === token) {
        // A timed-out mutation may have reached the server. Stay blocked until the
        // authoritative list is reloaded; never write using an assumed selection.
        setCloudStatus('error');
        notify(selected ? 'Équipe sélectionnée, mais son chargement a échoué. Réessayez Neon.'
          : error instanceof Error && error.name !== 'AbortError' ? error.message : 'Changement non confirmé. Réessayez Neon avant de continuer.', 'error');
      }
      return false;
    } finally {
      clearTimeout(timeout);
      if (generation.current === token) {
        busy.current = false;
        setTeamBusy(false);
        if (hydrated.current && dirty.current) void flush();
      }
    }
  }, [flush, hydrateTeam, notify]);

  const switchTeam = useCallback(async (id: string) => {
    if (!teams.some(team => team.id === id)) { notify('Équipe introuvable.', 'error'); return false; }
    if (id === selectedId.current && hydrated.current && !busy.current && !uploading.current
      && !dirty.current && !pendingRounds.current.length && !conflict.current) return true;
    return changeTeam('PATCH', { teamId: id });
  }, [teams, changeTeam, notify]);
  const createTeam = useCallback(async (name: string) => {
    const clean = name.trim();
    if (!clean || clean.length > 60 || /\p{Cc}/u.test(name)) {
      notify('Le nom doit contenir de 1 à 60 caractères, sans caractère de contrôle.', 'error'); return false;
    }
    return changeTeam('POST', { name: clean });
  }, [changeTeam, notify]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current && !pendingRounds.current.length) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  const updateTeam = useCallback((update: (current: TeamState) => TeamState) => {
    if (busy.current || !hydrated.current || conflict.current) { notify('Action indisponible : changement d’équipe ou conflit de sauvegarde en cours.', 'error'); return false; }
    const next = update(latest.current);
    try { validateTeamInput(next); }
    catch (error) { notify(error instanceof Error ? error.message : 'Action invalide.', 'error'); return false; }
    if (next === latest.current) return true;
    latest.current = next;
    dirty.current = true;
    setState(latest.current);
    const teamId = selectedId.current;
    setTeams(current => current.map(team => team.id === teamId ? { ...team, memberCount: next.roster.length } : team));
    void flush();
    return true;
  }, [flush, notify]);
  const saveRound = useCallback((round: HistoryRound) => {
    if (busy.current || !hydrated.current || conflict.current) { notify('Bilan non envoyé : équipe indisponible ou conflit de sauvegarde.', 'error'); return; }
    try { validateHistoryInput(round); }
    catch { notify('Bilan invalide : aucun enregistrement envoyé.', 'error'); return; }
    pendingRounds.current = normalizeHistory([round, ...pendingRounds.current]);
    void flush();
  }, [flush, notify]);
  const retryCloud = useCallback(() => {
    if (busy.current || uploading.current) return;
    if (conflict.current) {
      notify('Conflit de sauvegarde : vos modifications sont conservées en mémoire. Rechargez la page uniquement si vous acceptez de les abandonner.', 'error');
    } else if (hydrated.current) void flush();
    else { setCloudStatus('loading'); setRetry(value => value + 1); }
  }, [flush, notify]);
  const resetToday = useCallback(async () => {
    const teamId = selectedId.current;
    if (!teamId || !todayRound || busy.current || uploading.current || dirty.current || pendingRounds.current.length || conflict.current) {
      notify('Attendez la confirmation des sauvegardes avant de réinitialiser.', 'warning'); return false;
    }
    busy.current = true;
    setTeamBusy(true);
    const controller = new AbortController();
    loadController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/history', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-Team-Id': teamId }, body: JSON.stringify({ roundId: todayRound.id }), signal: controller.signal });
      if (!response.ok) throw new Error();
      setDailyReady(false);
      // Leave the guarded timer route before clearing its completed-result gate.
      window.history.replaceState(null, '', '/participants');
      return await hydrateTeam(teamId, controller, generation.current);
    } catch {
      // Reset may have committed before a network failure: require authoritative reload.
      hydrated.current = false;
      setReady(false);
      setCloudStatus('error');
      notify('Réinitialisation non confirmée. Réessayez Neon pour recharger le bilan.', 'error');
      return false;
    } finally { clearTimeout(timeout); busy.current = false; setTeamBusy(false); }
  }, [todayRound, hydrateTeam, notify]);
  const activeTeamName = teams.find(team => team.id === activeTeamId)?.name ?? '';
  return <TeamContext.Provider value={{ teams, activeTeamId, activeTeamName, teamBusy, dailyReady, todayRound, resetToday, setDailyReady, switchTeam, createTeam, state, ready, cloudStatus, retryCloud, saveRound, updateTeam }}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
}