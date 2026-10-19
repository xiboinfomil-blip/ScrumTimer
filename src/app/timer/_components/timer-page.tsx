'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useTeam } from '@/providers/team-provider';
import { useLiveBroadcast } from '@/hooks/use-live-broadcast';
import { usePresentation } from '@/hooks/use-presentation';
import { ScreenTabs } from '@/components/ui/screen-tabs';
import { segmentedTabs } from '@/components/ui/styles';
import { useStandupTimer } from '@/hooks/use-standup-timer';
import { useStepGuard } from '@/hooks/use-step-guard';
import { DailyPrompts } from './daily-prompts';
import { TeamLineup } from './team-lineup';
import { TimerPanel } from './timer-panel';
import { SessionResults } from './session-results';
import { TimerManagementDialog } from './timer-management-dialog';
import { useViewMotion } from '@/hooks/use-view-motion';
import { useDailyHints } from '@/hooks/use-daily-hints';
import { roundSpeakers } from '@/lib/timer-completion';

export type StandupTimer = ReturnType<typeof useStandupTimer>;

export function TimerPage() {
  const reduced = useReducedMotion();
  const allowed = useStepGuard('timer');
  const timer = useStandupTimer();
  const [view, setView] = useState<'timer' | 'team' | 'prompts'>('timer');
  const [sharing, setSharing] = useState(false);
  const panels = useViewMotion(`${view}-${timer.focusMode}`);
  const { activeTeamId, activeTeamName } = useTeam();
  const notes = useDailyHints(activeTeamId);
  const refreshNotes = notes.retry;
  useEffect(() => { refreshNotes(); }, [timer.activeId, refreshNotes]);
  const note = notes.data?.hints.find(hint => hint.participantId === timer.person?.id);
  const target = useRef<HTMLDivElement>(null);
  const presentation = usePresentation(target);
  const index = timer.people.findIndex(person => person.id === timer.activeId);
  const following = [...timer.people.slice(index + 1), ...timer.people.slice(0, Math.max(0, index))].find(person => !person.done && !person.postponed);
  const broadcast = useLiveBroadcast(allowed ? activeTeamId : null, {
    speaker: timer.person?.name ?? '', nextSpeaker: following?.name ?? '', teamName: activeTeamName,
    running: timer.running, remaining: timer.remaining, deadline: timer.deadline,
    completed: timer.people.filter(person => person.done).length, total: timer.people.length,
  });

  if (!allowed) return null;
  if (timer.people.length > 0 && !timer.activeId && timer.people.every(person => person.done)) return <SessionResults timer={{ ...timer, people: roundSpeakers(timer.people) }} />;

  const perPerson = timer.duration % 60
    ? `${Math.floor(timer.duration / 60)} min ${timer.duration % 60} s`
    : `${timer.duration / 60} min`;

  return (
    <motion.div initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : .45, ease: [.22, 1, .36, 1] }} ref={target} id="timer-page" className={`flex min-h-0 flex-1 flex-col gap-3 max-[650px]:gap-2 [@media(max-height:650px)]:gap-1 ${presentation.presenting ? 'fixed inset-0 z-[1400] h-dvh max-w-none! bg-white p-3 sm:p-6' : 'mx-auto w-full max-w-6xl'} overflow-hidden`} data-mode={timer.focusMode ? 'speaking' : 'setup'}>
      <Dialog open={!timer.activeId && timer.people.some(person => person.postponed && !person.done)} aria-labelledby="postponed-choice-title" aria-describedby="postponed-choice-description" fullWidth maxWidth="xs" sx={{ zIndex: 1500 }}>
        <DialogTitle id="postponed-choice-title">Faire passer les personnes reportées ?</DialogTitle>
        <DialogContent>
          <p id="postponed-choice-description" className="mb-3 text-sm text-muted">Les passages disponibles sont terminés. Retournez au même baromètre pour recueillir les humeurs des personnes reportées, puis reprenez ce tour. Sinon, terminez sans elles : elles ne figureront pas au bilan.</p>
          {!timer.people.some(person => person.done && !person.postponed) && <p className="mt-2 text-xs text-muted">Au moins un passage doit être terminé pour enregistrer un bilan.</p>}
        </DialogContent>
        <DialogActions className="flex-wrap gap-1"><Button onClick={timer.openLateCheckin} sx={{ minHeight: 44 }}>Retour au baromètre</Button><Button onClick={timer.finishWithoutPostponed} disabled={!timer.people.some(person => person.done && !person.postponed)} sx={{ minHeight: 44 }}>Terminer sans les personnes en attente</Button></DialogActions>
      </Dialog>
      <Dialog open={sharing} onClose={() => setSharing(false)} aria-labelledby="sharing-title" fullWidth maxWidth="xs">
        <DialogTitle id="sharing-title">Diffusion et présentation</DialogTitle>
        <DialogContent><div className="flex flex-col items-start gap-2" aria-label="Diffusion et présentation">
        <Button size="small" onClick={broadcast.toggle} aria-pressed={broadcast.enabled} sx={{ minHeight: 44, fontSize: 11 }}>{broadcast.enabled ? 'Arrêter le direct' : 'Diffuser en direct'}</Button>
        <Button size="small" component={Link} href={`/spectator?team=${encodeURIComponent(activeTeamId ?? '')}`} target="_blank" rel="noopener noreferrer" sx={{ minHeight: 44, fontSize: 11 }}>Lien spectateur</Button>
        <Button size="small" onClick={() => { setSharing(false); void presentation.toggle(); }} aria-pressed={presentation.presenting} sx={{ minHeight: 44, fontSize: 11 }}>{presentation.presenting ? 'Quitter la présentation' : 'Présentation'}</Button>
        <span role="status" className="text-[10px] text-muted">{broadcast.enabled ? broadcast.status : presentation.notice}</span>
        </div></DialogContent><DialogActions><Button onClick={() => setSharing(false)}>Fermer</Button></DialogActions>
      </Dialog>
      <header className="flex shrink-0 items-center justify-between gap-3 px-1">
        <div className="min-w-0"><p className="mb-1 flex items-center gap-2 text-xs font-semibold text-brand"><span aria-hidden="true" className={`size-2 rounded-full ${timer.running ? 'bg-success' : 'bg-accent'}`} />Étape 3 sur 3 · Le point quotidien</p><h1 className="text-3xl font-bold tracking-tight text-ink max-[650px]:text-xl [@media(max-height:650px)]:text-xl">{timer.focusMode ? 'On vous écoute' : 'À chacun son tour'}</h1><p id="overview-people" className="mt-1 text-sm text-muted max-[650px]:text-xs [@media(max-height:650px)]:hidden">{timer.focusMode ? `${timer.people.filter(person => person.done).length} / ${timer.people.length} passages terminés · Une voix à la fois.` : `${timer.people.length} personnes · ${perPerson} chacun · Réglez, puis démarrez.`}</p></div>
        <button type="button" onClick={() => presentation.presenting ? void presentation.toggle() : setSharing(true)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 text-xs font-semibold text-brand hover:border-brand/30 hover:bg-blue-50">{broadcast.enabled && <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />}{presentation.presenting ? 'Quitter' : broadcast.enabled ? 'En direct' : 'Diffusion'}</button>
      </header>
      {!timer.focusMode && !presentation.presenting && <ScreenTabs
        className={`${segmentedTabs} h-13 border border-slate-200/70 p-1 [&>button]:min-h-11 [@media(max-height:650px)]:h-11 [@media(max-height:650px)]:border-0 [@media(max-height:650px)]:p-0`}
        label="Panneau du minuteur"
        value={view}
        onChange={setView}
        tabs={[
          { value: 'timer', label: 'Minuteur' },
          { value: 'team', label: 'Participants' },
          { value: 'prompts', label: note ? 'Pense-bête' : 'Questions' },
        ]}
      />}
      <div ref={panels} className={`workspace grid min-h-0 min-w-0 flex-1 items-stretch gap-4 overflow-hidden max-[650px]:gap-2 ${presentation.presenting ? 'grid-cols-1' : timer.focusMode ? 'grid-cols-[minmax(0,1fr)_240px] max-[800px]:grid-cols-1' : 'grid-cols-[200px_minmax(0,1fr)_190px] min-[1100px]:grid-cols-[230px_minmax(0,1fr)_230px] max-[800px]:grid-cols-[minmax(0,1fr)]'}`} data-view={timer.focusMode || presentation.presenting ? 'timer' : view}>
        {!timer.focusMode && !presentation.presenting && <TeamLineup timer={timer} className={view !== 'team' ? 'max-[800px]:hidden' : ''} />}
        <TimerPanel notes={notes} timer={{ ...timer, manage: () => { if (presentation.presenting) void presentation.toggle(); timer.manage(); } }} className={!timer.focusMode && !presentation.presenting && view !== 'timer' ? 'max-[800px]:hidden' : ''} />
        {!presentation.presenting && <DailyPrompts speakerId={timer.activeId} speakerName={timer.person?.name} note={note?.hint} notesError={notes.error} retryNotes={notes.retry} className={timer.focusMode || view !== 'prompts' ? 'max-[800px]:hidden' : ''} />}
      </div>
      <TimerManagementDialog timer={timer} />
    </motion.div>
  );
}