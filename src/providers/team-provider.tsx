'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { TeamState } from '@/types/team';
import { defaultTeam, normalizeTeam } from '@/lib/team/team-storage';
import { normalizeHistory, type HistoryRound } from '@/lib/history/history';
import { validateHistoryInput, validateTeamInput } from '@/lib/team/team-validation';
import { useNotify } from '@/providers/notification-provider';
import { usePathname } from 'next/navigation';
import { resolveTeamContext, teamContextUrl } from '@/lib/team/team-context';
import { clearCheckpoint, readCheckpoint, parseCheckpoint, writeCheckpoint, checkpointContext, checkpointDay, invalidatesCheckpoint, type TimerCheckpoint, type TimerState } from '@/lib/timer/timer-checkpoint';
import { rejoinCheckpoint } from '@/lib/timer/timer-completion';
import type { Mood } from '@/types/team';
import { CloudRequestError, cloudFetch, cloudRetryDelay, isTransientCloudError, sameCloudTeam } from '@/lib/persistence/cloud-retry';
import { isTeamCategory, type TeamCategory, type TeamSummary, type TeamDirectoryUpdate } from '@/lib/team/team-directory';
import type { JiraSprintSelection } from '@/lib/jira/jira';
export type { TeamSummary } from '@/lib/team/team-directory';

interface TeamList {
  teams: TeamSummary[];
  activeTeamId: string | null;
}

const TEAM_FAVORITES_KEY = 'standup.team.favorites.v1';

function readFavoriteIds() {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(TEAM_FAVORITES_KEY) ?? '[]');
    if (Array.isArray(value) && value.every(id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id))) return value as string[];
  } catch { /* Favorites remain available in memory when storage is blocked. */ }
  return [];
}

function withLocalFavorites(teams: TeamSummary[], favoriteIds: string[]) {
  const favorites = new Set(favoriteIds);
  return teams.map(team => ({ ...team, favorite: favorites.has(team.id) }));
}

function readTeamList(value: unknown): TeamList {
  const list = value as TeamList | null;
  if (!list || !Array.isArray(list.teams) || (list.activeTeamId !== null && typeof list.activeTeamId !== 'string')
    || !list.teams.every(team => typeof team.id === 'string' && typeof team.name === 'string'
      && Number.isInteger(team.memberCount) && team.memberCount >= 0
      && (team.category === undefined || team.category === null || isTeamCategory(team.category))
      && (team.favorite === undefined || typeof team.favorite === 'boolean'))
    || (list.teams.some(team => !team.jiraLocked) ? !list.teams.some(team => team.id === list.activeTeamId && !team.jiraLocked) : list.activeTeamId !== null)) throw new Error('Liste des équipes invalide.');
  return { ...list, teams: list.teams.map(team => ({ ...team, category: team.category ?? null, favorite: team.favorite ?? false })) };
}

interface TeamContextValue {
  getTimerCheckpoint: () => TimerCheckpoint | null;
  storeTimerCheckpoint: (timer: TimerState, roundId: string | null) => boolean;
  rejoinLateParticipant: (id: string, mood: Mood) => boolean;
  participantOrder: string[];
  setParticipantOrder: (order: string[]) => void;
  teams: TeamSummary[];
  activeTeamId: string | null;
  activeTeamName: string;
  teamBusy: boolean;
  dailyReady: boolean;
  todayRound: HistoryRound | null;
  resetToday: () => Promise<boolean>;
  setDailyReady: (ready: boolean) => void;
  switchTeam: (id: string) => Promise<boolean>;
  createTeam: (name: string, category?: TeamCategory | null, sprint?: JiraSprintSelection) => Promise<boolean>;
  syncSprint: (sprint: JiraSprintSelection) => Promise<boolean>;
  updateTeamDirectory: (update: TeamDirectoryUpdate) => Promise<boolean>;
  setTeamFavorite: (teamId: string, favorite: boolean) => void;
  deleteTeam: (id: string, name: string) => Promise<boolean>;
  state: TeamState;
  ready: boolean;
  cloudStatus: 'loading' | 'saved' | 'saving' | 'error';
  retryCloud: () => void;
  saveRound: (round: HistoryRound) => void;
  updateTeam: (update: (current: TeamState) => TeamState) => boolean;
}

const TeamContext = createContext<TeamContextValue | null>(null);

export function TeamProvider({ children }: { children: ReactNode }) {
  const [participantOrder, setParticipantOrder] = useState<string[]>([]);
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
  const favoriteIds = useRef<string[]>([]);
  const loadController = useRef<AbortController | null>(null);
  const writeController = useRef<AbortController | null>(null);
  const directoryController = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const latest = useRef(state);
  const hydrated = useRef(false);
  const dirty = useRef(false);
  const uploading = useRef(false);
  const conflict = useRef(false);
  const pendingRounds = useRef<HistoryRound[]>([]);
  const mounted = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttempt = useRef(0);
  const retryKind = useRef<'load' | 'write' | null>(null);
  const resumeRetry = useRef<() => void>(() => {});
  const loadNotice = useRef(false);
  const submittedTeam = useRef<TeamState | null>(null);
  const timerMemory = useRef<{ teamId: string; checkpoint: TimerCheckpoint } | null>(null);
  const getTimerCheckpoint = useCallback(() => {
    const id = selectedId.current;
    if (!id) return null;
    const memory = timerMemory.current;
    return (memory?.teamId === id ? parseCheckpoint(JSON.stringify(memory.checkpoint), latest.current) : null) ?? readCheckpoint(id, latest.current);
  }, []);
  const storeTimerCheckpoint = useCallback((timer: TimerState, roundId: string | null) => {
    const id = selectedId.current;
    if (!id) return false;
    const team = latest.current;
    timerMemory.current = { teamId: id, checkpoint: { version: 1, day: checkpointDay(), context: checkpointContext(team), session: team.session, postponed: team.postponed ?? [], timer, roundId } };
    return writeCheckpoint(id, team, timer, roundId);
  }, []);

  const clearRetry = useCallback(() => {
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    retryKind.current = null;
    retryAttempt.current = 0;
  }, []);

  const scheduleRetry = useCallback((kind: 'load' | 'write', error: unknown) => {
    if (!mounted.current) return false;
    if (!isTransientCloudError(error) || conflict.current) { clearRetry(); return false; }
    retryKind.current = kind;
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      resumeRetry.current();
    }, cloudRetryDelay(retryAttempt.current++, error instanceof CloudRequestError ? error.retryAfter : null));
    return true;
  }, [clearRetry]);

  useEffect(() => {
    if (!activeTeamId) return;
    const url = teamContextUrl(window.location.href, activeTeamId);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== url) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, [activeTeamId, pathname]);

  const flush = useCallback(async () => {
    const teamId = selectedId.current;
    if (!mounted.current || !teamId || busy.current || !hydrated.current || uploading.current || conflict.current || retryTimer.current !== null) return;
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
          const previousSubmitted = submittedTeam.current;
          submittedTeam.current ??= snapshot;
          const response = await cloudFetch('/api/team', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Team-Id': teamId }, body: JSON.stringify({ team: snapshot, revision: revision.current }), signal: controller.signal });
          if (response.status === 409) {
            submittedTeam.current = previousSubmitted ?? snapshot;
            const authoritative = await cloudFetch('/api/team', { cache: 'no-store', headers: { 'X-Team-Id': teamId }, signal: controller.signal });
            if (!authoritative.ok) throw new CloudRequestError(authoritative);
            const saved = await authoritative.json();
            if (generation.current !== currentGeneration || controller.signal.aborted) return;
            if (Number.isSafeInteger(saved.revision) && saved.revision >= revision.current
              && (sameCloudTeam(saved.team, latest.current) || sameCloudTeam(saved.team, snapshot)
                || (previousSubmitted !== null && sameCloudTeam(saved.team, previousSubmitted)))) {
              revision.current = saved.revision;
              dirty.current = !sameCloudTeam(saved.team, latest.current);
              submittedTeam.current = null;
              continue;
            }
            conflict.current = true;
            throw new CloudRequestError(response);
          }
          const saved = await response.json();
          if (generation.current !== currentGeneration || controller.signal.aborted) return;
          revision.current = saved.revision;
          dirty.current = snapshot !== latest.current;
          submittedTeam.current = null;
        } else {
          const round = pendingRounds.current[0];
          const response = await cloudFetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Team-Id': teamId }, body: JSON.stringify(round), signal: controller.signal });
          if (response.status === 409) {
            const existing = await cloudFetch('/api/history', { cache: 'no-store', headers: { 'X-Team-Id': teamId }, signal: controller.signal });
            if (!existing.ok) throw new CloudRequestError(existing);
            const history = await existing.json();
            if (generation.current !== currentGeneration || controller.signal.aborted) return;
            const winner = normalizeHistory(history.rounds).find(item => new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Mauritius' }).format(new Date(item.completedAt)) === history.day);
            if (!winner) throw new Error('daily result unavailable');
            clearCheckpoint(teamId);
            timerMemory.current = null;
            setTodayRound(winner);
            pendingRounds.current = pendingRounds.current.filter(item => item.id !== round.id);
            if (winner.id !== round.id) notify('Ce point quotidien a déjà été terminé sur un autre appareil. Le bilan enregistré est affiché.', 'warning');
            continue;
          }
          if (!response.ok) throw new CloudRequestError(response);
          if (generation.current !== currentGeneration || controller.signal.aborted) return;
          clearCheckpoint(teamId);
          timerMemory.current = null;
          setTodayRound(round);
          pendingRounds.current = pendingRounds.current.filter(item => item.id !== round.id);
        }
      }
      if (generation.current === currentGeneration) { clearRetry(); setCloudStatus('saved'); }
    } catch (error) {
      if (mounted.current && generation.current === currentGeneration) {
        setCloudStatus('error');
        scheduleRetry('write', error);
        if (conflict.current) notify('Conflit de sauvegarde : changement d’équipe bloqué. Vos modifications restent en attente.', 'error');
      }
    } finally {
      clearTimeout(timeout);
      if (writeController.current === controller) writeController.current = null;
      uploading.current = false;
    }
  }, [notify, clearRetry, scheduleRetry]);

  const hydrateTeam = useCallback(async (teamId: string, controller: AbortController, token: number) => {
    // Independent reads share the cancellation/generation gate, not a network waterfall.
    const [response, historyResponse] = await Promise.all([
      cloudFetch('/api/team', { cache: 'no-store', headers: { 'X-Team-Id': teamId }, signal: controller.signal }),
      cloudFetch('/api/history', { cache: 'no-store', headers: { 'X-Team-Id': teamId }, signal: controller.signal }),
    ]);
    if (!response.ok) throw new Error('Chargement de l’équipe impossible.');
    if (!historyResponse.ok) throw new Error('Chargement du bilan du jour impossible.');
    const [saved, history] = await Promise.all([response.json(), historyResponse.json()]);
    if (generation.current !== token || controller.signal.aborted) return false;
    const day = history.day ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Mauritius' }).format(new Date());
    const today = normalizeHistory(history.rounds).find(round => new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Mauritius' }).format(new Date(round.completedAt)) === day) ?? null;
    setTodayRound(today);
    timerMemory.current = null;
    revision.current = saved.revision;
    latest.current = normalizeTeam(saved.team);
    if (today) clearCheckpoint(teamId);
    else {
      const checkpoint = readCheckpoint(teamId, latest.current);
      if (checkpoint) latest.current = { ...latest.current, session: checkpoint.session, postponed: checkpoint.postponed };
    }
    setParticipantOrder([]);
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

  const clearSelection = useCallback(() => {
    selectedId.current = null;
    setActiveTeamId(null);
    latest.current = defaultTeam();
    setState(latest.current);
    revision.current = 0;
    dirty.current = false;
    hydrated.current = true;
    setTodayRound(null);
    setDailyReady(false);
    // The companion is capability-scoped and does not need a directory team.
    if (window.location.pathname !== '/remote') window.history.replaceState(window.history.state, '', '/teams');
    setReady(true);
    setCloudStatus('saved');
  }, []);

  useEffect(() => {
    mounted.current = true;
    const resume = () => {
      if (document.visibilityState === 'visible' || document.visibilityState === undefined) resumeRetry.current();
    };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      mounted.current = false;
      clearRetry();
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
      loadController.current?.abort();
      writeController.current?.abort();
      directoryController.current?.abort();
    };
  }, [clearRetry]);

  useEffect(() => {
    const syncFavorites = (event: StorageEvent) => {
      if (event.key !== TEAM_FAVORITES_KEY && event.key !== null) return;
      favoriteIds.current = readFavoriteIds();
      setTeams(current => withLocalFavorites(current, favoriteIds.current));
    };
    window.addEventListener('storage', syncFavorites);
    return () => window.removeEventListener('storage', syncFavorites);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadController.current = controller;
    const token = ++generation.current;
    busy.current = true;
    hydrated.current = false;
    setTeamBusy(true);
    setReady(false);
    setCloudStatus('loading');
    const timeout = setTimeout(() => controller.abort(), 15000);
    void (async () => {
      try {
        const response = await cloudFetch('/api/teams', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Liste des équipes indisponible.');
        const list = readTeamList(await response.json());
        if (generation.current !== token || controller.signal.aborted) return;
        favoriteIds.current = readFavoriteIds();
        setTeams(withLocalFavorites(list.teams, favoriteIds.current));
        if (!list.activeTeamId) { clearSelection(); clearRetry(); loadNotice.current = false; return; }
        const teamId = resolveTeamContext(list.teams.filter(team => !team.jiraLocked).map(team => team.id), selectedId.current
          ?? new URL(window.location.href).searchParams.get('team'), list.activeTeamId);
        selectedId.current = teamId;
        setActiveTeamId(teamId);
        if (await hydrateTeam(teamId, controller, token)) { clearRetry(); loadNotice.current = false; }
      } catch (error) {
        if (mounted.current && generation.current === token) {
          setCloudStatus('error');
          const automatic = scheduleRetry('load', error);
          if (!loadNotice.current) {
            loadNotice.current = true;
            notify(automatic ? 'Neon est temporairement indisponible. Nouvelle tentative automatique ; aucune équipe de remplacement n’est utilisée.'
              : 'Impossible de charger les équipes depuis Neon. Réessayez ; aucune équipe de remplacement n’est utilisée.', 'error');
          }
        }
      } finally {
        clearTimeout(timeout);
        controller.abort();
        if (generation.current === token) {
          busy.current = false;
          setTeamBusy(false);
          if (hydrated.current && dirty.current) void flush();
        }
      }
    })();
    return () => { if (generation.current === token) generation.current = token + 1; clearTimeout(timeout); controller.abort(); loadController.current?.abort(); writeController.current?.abort(); };
  }, [retry, flush, hydrateTeam, notify, clearSelection, clearRetry, scheduleRetry]);

  useEffect(() => {
    resumeRetry.current = () => {
      if (!mounted.current || busy.current || uploading.current || conflict.current || !retryKind.current) return;
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
      retryTimer.current = null;
      if (retryKind.current === 'write') void flush();
      else { busy.current = true; setRetry(value => value + 1); }
    };
  }, [flush]);

  const changeTeam = useCallback(async (method: 'PATCH' | 'POST', body: { teamId: string } | { name: string; category?: TeamCategory | null; kind?: 'sprint'; sprint?: JiraSprintSelection }, sync?: JiraSprintSelection) => {
    if (busy.current || uploading.current || dirty.current || pendingRounds.current.length || conflict.current) {
      notify(conflict.current ? 'Conflit de sauvegarde : changement d’équipe bloqué. Vos modifications restent en attente.'
        : 'Changement d’équipe indisponible : attendez la confirmation des sauvegardes, ou réessayez Neon.', 'error');
      return false;
    }
    if (!hydrated.current) { notify('Chargez votre équipe avant de changer d’équipe.', 'error'); return false; }
    if (sync && (latest.current.session.length || getTimerCheckpoint()?.session.length)) { notify('Terminez ou annulez le point préparé avant de synchroniser le sprint.', 'error'); return false; }
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
    const timeout = setTimeout(() => controller.abort(), sync || ('sprint' in body && body.sprint) ? 60_000 : 15_000);
    let selected = false;
    try {
      if (sync) {
        const result = await cloudFetch('/api/jira', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Team-Id': selectedId.current ?? '' }, body: JSON.stringify({ action: 'sync', revision: revision.current, sprint: sync }), signal: controller.signal });
        if (!result.ok) { const failure = await result.json(); throw new Error(failure.error ?? 'Synchronisation Jira impossible.'); }
        if (generation.current !== token || controller.signal.aborted) return false;
        if (selectedId.current) clearCheckpoint(selectedId.current);
        timerMemory.current = null;
      }
      const response = await cloudFetch('/api/teams', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      if (!response.ok) { const failure = await response.json(); throw new Error(failure.error ?? 'Le changement d’équipe a échoué. Réessayez Neon.'); }
      const list = readTeamList(await response.json());
      if (generation.current !== token || controller.signal.aborted) return false;
      if (!list.activeTeamId) throw new Error('Équipe sélectionnée indisponible.');
      selected = true;
      selectedId.current = list.activeTeamId;
      // Hide the previous guarded route before a newly created empty team hydrates.
      if (method === 'POST') window.history.replaceState(window.history.state, '', `/manage-team?team=${list.activeTeamId}`);
      setTeams(withLocalFavorites(list.teams, favoriteIds.current));
      setActiveTeamId(list.activeTeamId);
      setState(defaultTeam());
      return await hydrateTeam(list.activeTeamId, controller, token);
    } catch (error) {
      if (generation.current === token) {
        // A timed-out mutation may have reached the server. Stay blocked until the
        // authoritative list is reloaded; never write using an assumed selection.
        setCloudStatus('error');
        scheduleRetry('load', error);
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
  }, [flush, getTimerCheckpoint, hydrateTeam, notify, scheduleRetry]);

  const switchTeam = useCallback(async (id: string) => {
    if (!teams.some(team => team.id === id)) { notify('Équipe introuvable.', 'error'); return false; }
    if (id === selectedId.current && hydrated.current && !busy.current && !uploading.current
      && !dirty.current && !pendingRounds.current.length && !conflict.current) return true;
    return changeTeam('PATCH', { teamId: id });
  }, [teams, changeTeam, notify]);
  const createTeam = useCallback(async (name: string, category?: TeamCategory | null, sprint?: JiraSprintSelection) => {
    const clean = name.trim();
    if (!clean || clean.length > 60 || /\p{Cc}/u.test(name)) {
      notify('Le nom doit contenir de 1 à 60 caractères, sans caractère de contrôle.', 'error'); return false;
    }
    return changeTeam('POST', sprint ? { name: clean, category: category ?? null, kind: 'sprint', sprint } : category === undefined ? { name: clean } : { name: clean, category });
  }, [changeTeam, notify]);
  const syncSprint = useCallback(async (sprint: JiraSprintSelection) => {
    if (!selectedId.current) return false;
    const confirmed = await changeTeam('PATCH', { teamId: selectedId.current }, sprint);
    if (confirmed) notify('Participants du sprint synchronisés.');
    return confirmed;
  }, [changeTeam, notify]);

  const updateTeamDirectory = useCallback(async (update: TeamDirectoryUpdate) => {
    if (busy.current || !hydrated.current || !teams.some(team => team.id === update.teamId)) return false;
    busy.current = true; setTeamBusy(true);
    const controller = new AbortController();
    directoryController.current = controller;
    const token = generation.current;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await cloudFetch('/api/teams', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update), signal: controller.signal });
      if (!response.ok) throw new Error('Classement non confirmé. Réessayez pour retrouver le choix partagé.');
      const list = readTeamList(await response.json());
      if (!mounted.current || generation.current !== token) return false;
      // Directory-only changes must never select a team or reset its live session.
      setTeams(withLocalFavorites(list.teams, favoriteIds.current));
      return true;
    } catch {
      if (mounted.current) notify('Classement non confirmé. Réessayez ou rechargez pour vérifier le choix enregistré.', 'error');
      return false;
    } finally {
      clearTimeout(timeout);
      if (directoryController.current === controller) directoryController.current = null;
      if (mounted.current && generation.current === token) {
        busy.current = false; setTeamBusy(false);
        if (dirty.current) void flush();
      }
    }
  }, [teams, notify, flush]);

  const setTeamFavorite = useCallback((teamId: string, favorite: boolean) => {
    if (busy.current || !hydrated.current || !teams.some(team => team.id === teamId)) return;
    const favorites = new Set(favoriteIds.current);
    if (favorite) favorites.add(teamId);
    else favorites.delete(teamId);
    favoriteIds.current = [...favorites];
    try { window.localStorage.setItem(TEAM_FAVORITES_KEY, JSON.stringify([...favorites])); }
    catch { notify('Ce favori ne peut pas être conservé sur cet appareil.', 'warning'); }
    setTeams(withLocalFavorites(teams, favoriteIds.current));
  }, [teams, notify]);

  const deleteTeam = useCallback(async (id: string, name: string) => {
    if (!teams.some(team => team.id === id && team.name === name) || busy.current || uploading.current || dirty.current || pendingRounds.current.length || conflict.current || !hydrated.current) {
      notify('Suppression indisponible. Attendez la confirmation des sauvegardes et vérifiez l’équipe.', 'warning');
      return false;
    }
    busy.current = true; setTeamBusy(true); setCloudStatus('saving');
    const controller = new AbortController();
    loadController.current?.abort(); loadController.current = controller;
    const token = ++generation.current;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await cloudFetch('/api/teams', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId: id, name }), signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Suppression non confirmée. Réessayez Neon.');
      const list = readTeamList(body);
      if (generation.current !== token || controller.signal.aborted) return false;
      setTeams(withLocalFavorites(list.teams, favoriteIds.current));
      if (selectedId.current === id) {
        // Leave stale guarded route children before changing the team state.
        window.history.replaceState(window.history.state, '', '/teams');
        setDailyReady(false); setTodayRound(null); setReady(false);
        hydrated.current = false;
        if (!list.activeTeamId) clearSelection();
        else {
          selectedId.current = list.activeTeamId; setActiveTeamId(list.activeTeamId);
          await hydrateTeam(list.activeTeamId, controller, token);
        }
      } else setCloudStatus('saved');
      notify('Équipe et toutes ses données associées supprimées.');
      return true;
    } catch (error) {
      if (generation.current === token) {
        // A timeout can follow a committed deletion. Block writes until reloaded.
        hydrated.current = false; setReady(false); setCloudStatus('error');
        scheduleRetry('load', error);
        notify(error instanceof Error && error.name !== 'AbortError' ? error.message : 'Suppression non confirmée. Réessayez Neon pour recharger les équipes.', 'error');
      }
      return false;
    } finally { clearTimeout(timeout); if (generation.current === token) { busy.current = false; setTeamBusy(false); } }
  }, [teams, notify, hydrateTeam, clearSelection, scheduleRetry]);

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
    if (invalidatesCheckpoint(latest.current, next)) {
      timerMemory.current = null;
      if (selectedId.current) clearCheckpoint(selectedId.current);
    }
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
  const rejoinLateParticipant = useCallback((id: string, mood: Mood) => {
    const checkpoint = getTimerCheckpoint();
    if (!checkpoint) return false;
    const resumed = rejoinCheckpoint(checkpoint, latest.current, id, mood);
    if (!resumed || !updateTeam(() => resumed.team)) return false;
    storeTimerCheckpoint(resumed.timer, checkpoint.roundId);
    return true;
  }, [getTimerCheckpoint, updateTeam, storeTimerCheckpoint]);
  const retryCloud = useCallback(() => {
    if (busy.current || uploading.current) return;
    if (conflict.current) {
      notify('Conflit de sauvegarde : vos modifications sont conservées en mémoire. Rechargez la page uniquement si vous acceptez de les abandonner.', 'error');
    } else {
      clearRetry();
      if (hydrated.current) void flush();
      else { setCloudStatus('loading'); setRetry(value => value + 1); }
    }
  }, [flush, notify, clearRetry]);
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
      const response = await cloudFetch('/api/history', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-Team-Id': teamId }, body: JSON.stringify({ roundId: todayRound.id }), signal: controller.signal });
      if (!response.ok) throw new Error();
      setDailyReady(false);
      // Leave the guarded timer route before clearing its completed-result gate.
      window.history.replaceState(null, '', '/participants');
      return await hydrateTeam(teamId, controller, generation.current);
    } catch (error) {
      // Reset may have committed before a network failure: require authoritative reload.
      hydrated.current = false;
      setReady(false);
      setCloudStatus('error');
      scheduleRetry('load', error);
      notify('Réinitialisation non confirmée. Réessayez Neon pour recharger le bilan.', 'error');
      return false;
    } finally { clearTimeout(timeout); busy.current = false; setTeamBusy(false); }
  }, [todayRound, hydrateTeam, notify, scheduleRetry]);
  const activeTeamName = teams.find(team => team.id === activeTeamId)?.name ?? '';
  return <TeamContext.Provider value={{ getTimerCheckpoint, storeTimerCheckpoint, rejoinLateParticipant, participantOrder, setParticipantOrder, teams, activeTeamId, activeTeamName, teamBusy, dailyReady, todayRound, resetToday, setDailyReady, switchTeam, createTeam, syncSprint, updateTeamDirectory, setTeamFavorite, deleteTeam, state, ready, cloudStatus, retryCloud, saveRound, updateTeam }}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
}