'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTeam } from '@/providers/team-provider';
import { useNotify } from '@/providers/notification-provider';
import { TimerAudio } from '@/lib/audio';
import { timerFrame } from '@/lib/timer';
import type { Mood } from '@/types/team';
import { completedRound } from '@/lib/history';
import { finishWaitingRound, roundSpeakers } from '@/lib/timer-completion';
import { createId } from '@/lib/team-storage';
import { recoverTimer, type TimerState } from '@/lib/timer-checkpoint';

export function useStandupTimer() {
  const { state: team, activeTeamId, updateTeam, saveRound, getTimerCheckpoint, storeTimerCheckpoint } = useTeam();
  const [lateChecking, setLateChecking] = useState(false);
  const [checkpoint] = useState(getTimerCheckpoint);
  const roundId = useRef<string | null>(checkpoint?.roundId ?? null);
  const notify = useNotify();
  const audio = useRef<TimerAudio | null>(null);
  const [timer, setTimer] = useState<TimerState>(() => {
    if (checkpoint) return recoverTimer(checkpoint.timer, Date.now());
    const people = team.session.flatMap(id => {
      const person = team.roster.find(p => p.id === id && p.present && (p.mood || team.postponed?.includes(id)));
      return person ? [{ ...person, postponed: team.postponed?.includes(id) ?? false, done: false, started: false, speakingSeconds: 0, budgetSeconds: 0, timeUp: false, attempts: 0 }] : [];
    });
    return { people, activeId: people.find(p => !p.postponed)?.id ?? null, previousId: null, remaining: team.duration, turnTotal: team.duration, running: false, turnStarted: false, focusMode: false, managing: false, ended: false, warned: false, deadline: 0 };
  });
  const latest = useRef(timer);
  const preferences = useRef(team);
  useEffect(() => { preferences.current = team; }, [team]);
  const storageNotice = useRef(false);
  useEffect(() => {
    if (!activeTeamId || !team.session.length) return;
    if (!storeTimerCheckpoint(timer, roundId.current) && !storageNotice.current) {
      storageNotice.current = true;
      notify('La reprise après actualisation est indisponible dans cet onglet : le stockage de session est bloqué. Le minuteur continue tant que la page reste ouverte.', 'warning');
    }
  }, [activeTeamId, team, timer, notify, storeTimerCheckpoint]);
  useEffect(() => {
    if (roundId.current && timer.people.length && timer.people.every(person => person.done)) {
      saveRound(completedRound(roundId.current, roundSpeakers(timer.people)));
    }
    // Recover a completed but unacknowledged round once on mount. Its stable ID
    // makes replay safe if the server committed before the previous page closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Event and interval handlers share one current snapshot, avoiding stale deadlines.
  const commit = useCallback((next: TimerState) => {
    latest.current = next;
    storeTimerCheckpoint(next, roundId.current);
    setTimer(next);
  }, [storeTimerCheckpoint]);
  const cleared = useCallback((current: TimerState, duration = preferences.current.duration): TimerState => ({ ...current, remaining: duration, turnTotal: duration, running: false, turnStarted: false, ended: false, warned: false, deadline: 0 }), []);
  const tick = useCallback(() => {
    const current = latest.current;
    if (!current.running) return current;
    const { remaining, elapsed } = timerFrame(current.deadline, Date.now(), current.remaining);
    const next = { ...current, remaining, people: current.people.map(person => person.id === current.activeId ? { ...person, speakingSeconds: Math.round((person.speakingSeconds + elapsed) * 1000) / 1000, timeUp: person.timeUp || remaining <= 0 } : person) };
    if (remaining <= 0 && !current.ended) {
      next.ended = true;
      if (preferences.current.sound) audio.current?.chime(true);
      const person = current.people.find(p => p.id === current.activeId);
      notify(`${person?.name ?? 'L’équipe'}, votre temps de parole est écoulé. Merci de conclure et de laisser la parole à la personne suivante.`, 'error');
    } else if (remaining > 0 && !current.warned && preferences.current.warning > 0 && remaining <= preferences.current.warning) {
      next.warned = true;
      if (preferences.current.sound) audio.current?.chime();
      notify(`Il reste ${Math.ceil(remaining)} secondes. Pensez à conclure.`, 'warning');
    }
    commit(next);
    return next;
  }, [commit, notify]);
  useEffect(() => {
    // No wakeups in setup/pause. Four updates/second keep the score/ring smooth;
    // deadlines and explicit action ticks retain exact elapsed/overtime accounting.
    if (!timer.running) return;
    const interval = setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, [tick, timer.running]);
  useEffect(() => () => { audio.current?.dispose(); audio.current = null; }, []);

  const reset = useCallback(() => { if (!latest.current.focusMode || latest.current.managing) commit(cleared(latest.current)); }, [commit, cleared]);
  const toggle = useCallback(() => {
    let current = latest.current;
    if (!current.activeId) return;
    if (current.managing) return;
    if (preferences.current.sound) { audio.current ??= new TimerAudio(); audio.current.prepare(); }
    if (current.running) { current = tick(); commit({ ...current, running: false }); return; }
    commit({ ...current, people: current.people.map(p => p.id === current.activeId ? { ...p, done: false, started: true, attempts: p.attempts + (current.turnStarted ? 0 : 1), budgetSeconds: p.started ? p.budgetSeconds : current.turnTotal } : p), running: true, turnStarted: true, focusMode: true, deadline: Date.now() + current.remaining * 1000 });
  }, [tick, commit]);
  const next = useCallback(() => {
    const current = tick();
    if (!current.activeId) return;
    const index = current.people.findIndex(p => p.id === current.activeId);
    const people = current.people.map(p => p.id === current.activeId ? { ...p, done: true } : p);
    const person = [...people.slice(index + 1), ...people.slice(0, index)].find(p => !p.done && !p.postponed);
    if (!person && people.every(p => p.done)) {
      roundId.current ??= createId();
      saveRound(completedRound(roundId.current, roundSpeakers(people)));
    }
    const prepared = cleared({ ...current, people, previousId: current.activeId, activeId: person?.id ?? null });
    prepared.people = prepared.people.map(candidate => candidate.id === person?.id ? { ...candidate, started: true, attempts: candidate.attempts + 1, budgetSeconds: candidate.started ? candidate.budgetSeconds : prepared.turnTotal } : candidate);
    if (person && preferences.current.sound) { audio.current ??= new TimerAudio(); audio.current.prepare(); }
    commit({ ...prepared, focusMode: Boolean(person), running: Boolean(person), turnStarted: Boolean(person), deadline: person ? Date.now() + prepared.remaining * 1000 : 0 });
    notify(person ? `${person.name}, à vous la parole !` : people.some(p => p.postponed) ? 'Les passages disponibles sont terminés. Faites rejoindre les personnes reportées ou terminez sans elles.' : 'Point quotidien terminé. Bonne journée à toute l’équipe !');
  }, [cleared, commit, notify, tick, saveRound]);
  const finishWithoutPostponed = useCallback(() => {
    const finished = finishWaitingRound(latest.current);
    if (!finished) return;
    roundId.current ??= createId();
    commit(finished);
    saveRound(completedRound(roundId.current, roundSpeakers(finished.people)));
    notify('Point quotidien terminé sans les personnes encore reportées. Leurs passages ne figurent pas au bilan.');
  }, [commit, saveRound, notify]);
  const select = useCallback((id: string) => {
    if (latest.current.focusMode) return;
    if (id === latest.current.activeId || !latest.current.people.some(p => p.id === id && !p.postponed)) return;
    const current = tick();
    commit(cleared({ ...current, activeId: id }));
  }, [cleared, commit, tick]);
  const newRound = useCallback(() => {
    const current = latest.current;
    roundId.current = null;
    commit(cleared({ ...current, focusMode: false, managing: false, previousId: null, people: current.people.map(p => ({ ...p, done: false, started: false, speakingSeconds: 0, budgetSeconds: 0, timeUp: false, attempts: 0 })), activeId: current.people.find(p => !p.postponed)?.id ?? null }));
    notify('Un nouveau tour commence. Faisons le point.');
  }, [cleared, commit, notify]);
  const addTime = useCallback(() => {
    if (latest.current.focusMode && !latest.current.managing) return;
    const current = tick();
    commit({ ...current, remaining: current.remaining + 30, turnTotal: current.turnTotal + 30, ended: false, warned: false, deadline: current.running ? Date.now() + (current.remaining + 30) * 1000 : current.deadline });
    notify('Un peu plus de temps : 30 secondes ajoutées.');
  }, [tick, commit, notify]);
  const setDuration = useCallback((duration: number) => {
    if (latest.current.focusMode && !latest.current.managing) return;
    if (!Number.isInteger(duration) || duration < 1 || duration > 3659) return;
    updateTeam(current => ({ ...current, duration }));
    commit(cleared(latest.current, duration));
    notify('Durée par personne mise à jour. Le minuteur a été réinitialisé.');
  }, [cleared, commit, notify, updateTeam]);
  const setWarning = useCallback((warning: number) => {
    if (latest.current.focusMode && !latest.current.managing) return;
    if (![0, 10, 15, 30, 60].includes(warning)) return;
    updateTeam(current => ({ ...current, warning }));
    commit({ ...latest.current, warned: false });
  }, [commit, updateTeam]);
  const manage = useCallback(() => {
    const current = tick();
    commit({ ...current, running: false, managing: true });
    notify('Minuteur en pause. Vous pouvez modifier les réglages.');
  }, [tick, commit, notify]);
  const closeManage = useCallback(() => commit({ ...latest.current, managing: false }), [commit]);
  const openLateCheckin = useCallback(() => {
    const current = tick();
    commit({ ...current, running: false, managing: false });
    setLateChecking(true);
  }, [tick, commit]);
  const closeLateCheckin = useCallback(() => setLateChecking(false), []);
  useEffect(() => {
    const fullscreenChange = () => {
      if (document.fullscreenElement || !matchMedia('(min-width: 1024px) and (pointer: fine)').matches || !latest.current.running) return;
      const current = tick();
      commit({ ...current, running: false });
      notify('Minuteur en pause. Revenez en plein écran puis reprenez votre passage.');
    };
    fullscreenChange();
    document.addEventListener('fullscreenchange', fullscreenChange);
    return () => document.removeEventListener('fullscreenchange', fullscreenChange);
  }, [tick, commit, notify]);
  const postpone = useCallback((id: string) => {
    const current = tick();
    const target = current.people.find(p => p.id === id);
    if (!target || target.done || target.postponed) return;
    const people = current.people.map(p => p.id === id ? { ...p, postponed: true } : p);
    if (current.activeId === id) {
      const index = people.findIndex(p => p.id === id);
      const following = [...people.slice(index + 1), ...people.slice(0, index)].find(p => !p.done && !p.postponed);
      commit(cleared({ ...current, people, activeId: following?.id ?? null, focusMode: false }));
    } else commit({ ...current, people });
    notify(`${target.name} : passage reporté, sans être marqué terminé.`);
  }, [tick, cleared, commit, notify]);
  const rejoin = useCallback((id: string, mood?: Mood) => {
    const current = latest.current;
    const target = current.people.find(p => p.id === id && p.postponed && !p.done);
    if (!target || !(mood ?? target.mood) || (mood !== undefined && ![1, 2, 3, 4].includes(mood))) return;
    const timestamp = new Date().toISOString();
    if (!updateTeam(value => ({ ...value, postponed: value.postponed?.filter(candidate => candidate !== id), roster: value.roster.map(p => p.id === id && mood !== undefined ? { ...p, mood, moodUpdatedAt: timestamp, moodSlide: value.currentMoodSlide ?? null } : p) }))) return;
    const person = { ...target, postponed: false, ...(mood !== undefined ? { mood, moodUpdatedAt: timestamp, moodSlide: preferences.current.currentMoodSlide ?? null } : {}) };
    const people = [...current.people.filter(p => p.id !== id), person];
    commit(current.activeId ? { ...current, people } : cleared({ ...current, people, activeId: id, focusMode: false }));
    notify(`${person.name} rejoint la fin du tour. Son minuteur attend Démarrer ou Suivant.`);
  }, [updateTeam, commit, cleared, notify]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]') || (event.target instanceof Element && event.target.closest('input,select,textarea,button,a,[contenteditable]')) || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
      if (event.code === 'Space') { event.preventDefault(); toggle(); }
      else if (event.key.toLowerCase() === 'n') next();
      else if (event.key.toLowerCase() === 'r') reset();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggle, next, reset]);

  return { ...timer, lateChecking, closeLateCheckin, person: timer.people.find(p => p.id === timer.activeId), duration: team.duration, warning: team.warning, toggle, reset, next, select, newRound, addTime, setDuration, setWarning, manage, closeManage, postpone, rejoin, finishWithoutPostponed, openLateCheckin };
}