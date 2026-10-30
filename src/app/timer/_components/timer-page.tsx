'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useTeam } from '@/providers/team-provider';
import { useLiveBroadcast } from '@/hooks/live/use-live-broadcast';
import { usePresentation } from '@/hooks/timer/use-presentation';
import { ScreenTabs } from '@/components/ui/screen-tabs';
import { segmentedTabs } from '@/components/ui/styles';
import { useStandupTimer } from '@/hooks/timer/use-standup-timer';
import { useStepGuard } from '@/hooks/team/use-step-guard';
import { DailyPrompts } from './daily-prompts';
import { TeamLineup } from './team-lineup';
import { TimerPanel } from './timer-panel';
import { SessionResults } from './session-results';
import { TimerManagementDialog } from './timer-management-dialog';
import { useViewMotion } from '@/hooks/motion/use-view-motion';
import { useDailyHints } from '@/hooks/meeting/use-daily-hints';
import { roundSpeakers } from '@/lib/timer/timer-completion';
import { LateCheckinDialog } from './late-checkin-dialog';
import { useTimerRemote } from '@/hooks/remote/use-timer-remote';
import { RemotePairingDialog } from './remote-pairing-dialog';
import SmartphoneRounded from '@mui/icons-material/SmartphoneRounded';
import ScreenShareRounded from '@mui/icons-material/ScreenShareRounded';
import { WorkflowHeading } from '@/components/ui/workflow-heading';

export type StandupTimer = ReturnType<typeof useStandupTimer>;

export function TimerPage() {
  const reduced = useReducedMotion();
  const allowed = useStepGuard('timer');
  const timer = useStandupTimer();
  const [view, setView] = useState<'timer' | 'prompts'>('timer');
  const [lineupOpen, setLineupOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [blackScreen, setBlackScreen] = useState(false);
  const panels = useViewMotion(`${view}-${timer.focusMode}`);
  const { activeTeamId, activeTeamName, teams } = useTeam();
  const isSprint = teams.find(team => team.id === activeTeamId)?.kind === 'sprint';
  const notes = useDailyHints(activeTeamId);
  const refreshNotes = notes.retry;
  const noteSpeaker = useRef({ teamId: activeTeamId, participantId: timer.activeId });
  useEffect(() => {
    const previous = noteSpeaker.current;
    noteSpeaker.current = { teamId: activeTeamId, participantId: timer.activeId };
    if (previous.teamId === activeTeamId && previous.participantId !== timer.activeId && !notes.loading) refreshNotes();
  }, [activeTeamId, timer.activeId, notes.loading, refreshNotes]);
  const note = notes.data?.hints.find(hint => hint.participantId === timer.person?.id);
  const target = useRef<HTMLDivElement>(null);
  const presentation = usePresentation(target);
  const index = timer.people.findIndex(person => person.id === timer.activeId);
  const following = [...timer.people.slice(index + 1), ...timer.people.slice(0, Math.max(0, index))].find(person => !person.done && !person.postponed);
  const remote = useTimerRemote(allowed ? activeTeamId : null, {
    speaker: timer.person?.name ?? '', nextSpeaker: following?.name ?? '', teamName: activeTeamName,
    activeId: timer.activeId, running: timer.running, remaining: timer.remaining, deadline: timer.deadline,
    completed: timer.people.filter(person => person.done).length, total: timer.people.length,
    blocked: timer.managing || timer.lateChecking || lineupOpen || remoteOpen || sharing,
    blackScreen, manualPenalty: timer.person?.manualPenalty ?? 0,
  }, { toggle: timer.toggle, next: timer.next, restart: timer.restartCurrent, penalty: timer.penalize, blackScreen: () => {
    if (timer.running) timer.toggle();
    setBlackScreen(value => !value);
  } });
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
    <motion.div initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : .45, ease: [.22, 1, .36, 1] }} ref={target} id="timer-page" className={`flex min-h-0 flex-1 flex-col gap-3 max-[650px]:gap-2 [@media(max-height:650px)]:gap-1 ${presentation.presenting ? 'fixed inset-0 z-[1400] h-dvh max-w-none! bg-slate-50 p-3 sm:p-6' : 'mx-auto w-full'} overflow-hidden`} data-mode={timer.focusMode ? 'speaking' : 'setup'}>
      <RemotePairingDialog open={remoteOpen} onClose={() => setRemoteOpen(false)} remote={remote} />
      {blackScreen && <button type="button" autoFocus onClick={() => setBlackScreen(false)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setBlackScreen(false); } }} aria-label="Rétablir l’écran" className="fixed inset-0 z-[3000] h-dvh w-screen bg-black text-transparent focus-visible:outline-2 focus-visible:outline-white">Rétablir l’écran</button>}
      <Dialog open={lineupOpen && !timer.lateChecking} onClose={() => setLineupOpen(false)} aria-labelledby="lineup-dialog-title" fullWidth maxWidth="sm" slotProps={{ paper: { sx: { height: 'min(640px, calc(100dvh - 32px))', m: 2, width: 'calc(100% - 32px)', borderRadius: '14px', border: '1px solid #dce3e9' } } }}>
        <DialogTitle id="lineup-dialog-title" className="border-t-2 border-t-accent pb-2! text-lg! font-bold!">Le tour de parole</DialogTitle>
        <DialogContent className="flex min-h-0 flex-1 flex-col"><p className="mb-3 shrink-0 text-xs text-muted">{timer.focusMode ? 'Votre passage reste sélectionné. Reprenez le minuteur une fois prêt.' : 'Choisissez la personne qui ouvrira le point.'}</p>{lineupOpen && <TeamLineup timer={timer} className="flex-1" />}</DialogContent>
        <DialogActions><Button onClick={() => setLineupOpen(false)} sx={{ minHeight: 44 }}>Revenir au passage</Button></DialogActions>
      </Dialog>
      <Dialog open={!timer.lateChecking && !timer.activeId && timer.people.some(person => person.postponed && !person.done)} aria-labelledby="postponed-choice-title" aria-describedby="postponed-choice-description" fullWidth maxWidth="xs" sx={{ zIndex: 1500 }} slotProps={{ paper: { sx: { borderRadius: '14px', border: '1px solid #dce3e9' } } }}>
        <DialogTitle id="postponed-choice-title" className="border-t-2 border-t-accent pb-2! text-lg! font-bold!">Faire passer les personnes reportées ?</DialogTitle>
        <DialogContent>
          <p id="postponed-choice-description" className="mb-3 text-sm text-muted">Les passages disponibles sont terminés. Ouvrez le baromètre dans une fenêtre pour recueillir les humeurs des personnes reportées, puis reprenez ce tour. Sinon, terminez sans elles : elles ne figureront pas au bilan.</p>
          {!timer.people.some(person => person.done && !person.postponed) && <p className="mt-2 text-xs text-muted">Au moins un passage doit être terminé pour enregistrer un bilan.</p>}
        </DialogContent>
        <DialogActions className="flex-wrap gap-1"><Button onClick={timer.openLateCheckin} sx={{ minHeight: 44 }}>Renseigner les humeurs</Button><Button onClick={timer.finishWithoutPostponed} disabled={!timer.people.some(person => person.done && !person.postponed)} sx={{ minHeight: 44 }}>Terminer sans les personnes en attente</Button></DialogActions>
      </Dialog>
      <Dialog open={sharing} onClose={() => setSharing(false)} aria-labelledby="sharing-title" fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: '14px', border: '1px solid #dce3e9' } } }}>
        <DialogTitle id="sharing-title" className="border-t-2 border-t-accent pb-2! text-lg! font-bold!">Diffusion et présentation</DialogTitle>
        <DialogContent><div className="flex flex-col gap-2" aria-label="Diffusion et présentation">
        <Button fullWidth onClick={broadcast.toggle} aria-label={broadcast.enabled ? 'Arrêter le direct' : 'Diffuser en direct'} aria-pressed={broadcast.enabled} sx={{ minHeight: 56, justifyContent: 'flex-start', border: '1px solid #dce3e9', textAlign: 'left', textTransform: 'none' }}><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-brand"><ScreenShareRounded /></span><span className="ml-3 grid justify-items-start"><strong className="text-sm">{broadcast.enabled ? 'Arrêter le direct' : 'Diffuser en direct'}</strong><span aria-hidden="true" className="text-[11px] font-normal text-muted">{broadcast.enabled ? 'Interrompre la diffusion du minuteur' : 'Afficher le minuteur sur un écran distant'}</span></span></Button>
        <Button fullWidth component={Link} href={`/spectator?team=${encodeURIComponent(activeTeamId ?? '')}`} target="_blank" rel="noopener noreferrer" aria-label="Lien spectateur" sx={{ minHeight: 56, justifyContent: 'flex-start', border: '1px solid #dce3e9', textAlign: 'left', textTransform: 'none' }}><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-brand"><SmartphoneRounded /></span><span className="ml-3 grid justify-items-start"><strong className="text-sm">Lien spectateur</strong><span aria-hidden="true" className="text-[11px] font-normal text-muted">Ouvrir une vue en lecture seule</span></span></Button>
        <Button fullWidth onClick={() => { setSharing(false); void presentation.toggle(); }} aria-label={presentation.presenting ? 'Quitter la présentation' : 'Présentation'} aria-pressed={presentation.presenting} sx={{ minHeight: 56, justifyContent: 'flex-start', border: '1px solid #dce3e9', textAlign: 'left', textTransform: 'none' }}><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-orange-50 text-amber-800"><ScreenShareRounded /></span><span className="ml-3 grid justify-items-start"><strong className="text-sm">{presentation.presenting ? 'Quitter la présentation' : 'Présentation'}</strong><span aria-hidden="true" className="text-[11px] font-normal text-muted">{presentation.presenting ? 'Revenir à la page complète' : 'Afficher le minuteur en plein écran'}</span></span></Button>
        <span role="status" className="text-xs text-muted">{broadcast.enabled ? broadcast.status : presentation.notice}</span>
        </div></DialogContent><DialogActions><Button onClick={() => setSharing(false)}>Fermer</Button></DialogActions>
      </Dialog>
      <WorkflowHeading step={3} title="Minuteur" description={<><span id="overview-people" className="max-[360px]:sr-only">{timer.people.length} personnes · {perPerson} chacun</span><span aria-hidden="true" className="hidden max-[360px]:inline">{timer.people.length} · {Math.floor(timer.duration / 60)} min/pers.</span></>} action={<div className="flex shrink-0 items-center gap-2 max-[360px]:gap-1">
        <button type="button" onClick={() => setRemoteOpen(true)} aria-label="Télécommande mobile" title="Télécommande mobile" aria-pressed={remote.enabled} className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl border ${remote.enabled ? 'border-brand bg-blue-50 text-brand' : 'border-line bg-white text-brand'} hover:bg-blue-50`}><SmartphoneRounded fontSize="small" /></button>
        <button type="button" onClick={() => { if (timer.running) timer.toggle(); setLineupOpen(true); }} title="Voir le tour de parole" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 text-xs font-semibold text-brand" aria-label="Voir le tour de parole"><span className="max-[650px]:hidden">Participants</span><span className="tabular-nums">{timer.people.filter(person => person.done).length}/{timer.people.length}</span></button>
        <button type="button" onClick={() => presentation.presenting ? void presentation.toggle() : setSharing(true)} aria-label={presentation.presenting ? 'Quitter' : broadcast.enabled ? 'En direct' : 'Diffusion'} title={presentation.presenting ? 'Quitter la présentation' : 'Diffusion'} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 text-xs font-semibold text-brand hover:border-brand/30 hover:bg-blue-50 max-[650px]:size-11 max-[650px]:px-0">{broadcast.enabled && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-success" />}<ScreenShareRounded fontSize="small" /><span className="max-[650px]:sr-only">{presentation.presenting ? 'Quitter' : broadcast.enabled ? 'En direct' : 'Diffusion'}</span></button>
        </div>} />
      {!presentation.presenting && <ScreenTabs
        className={`${segmentedTabs} h-13 border border-slate-200/70 p-1 [&>button]:min-h-11 max-[1359px]:flex min-[1360px]:hidden [@media(max-height:650px)]:flex [@media(max-height:650px)]:h-11 [@media(max-height:650px)]:border-0 [@media(max-height:650px)]:p-0`}
        label="Panneau du minuteur"
        value={view}
        onChange={setView}
        tabs={[
          { value: 'timer', label: 'Minuteur' },
          { value: 'prompts', label: isSprint ? 'Tickets & notes' : note ? 'Pense-bête' : 'Questions' },
        ]}
      />}
      <div ref={panels} className={`workspace grid min-h-0 min-w-0 flex-1 grid-cols-1 items-stretch gap-3 overflow-hidden max-[650px]:gap-2 ${presentation.presenting ? 'grid-rows-1' : 'grid-rows-1 min-[1360px]:grid-cols-[minmax(0,1fr)_minmax(0,720px)_minmax(0,1fr)]'}`} data-view={presentation.presenting ? 'timer' : view}>
        <TimerPanel notes={notes} timer={{ ...timer, manage: () => { if (presentation.presenting) void presentation.toggle(); timer.manage(); } }} className={`min-[1360px]:col-start-2 ${!presentation.presenting && view !== 'timer' ? 'max-[1359px]:hidden [@media(max-height:650px)]:hidden' : ''}`} />
        {!presentation.presenting && <DailyPrompts speakerId={timer.activeId} speakerName={timer.person?.name} note={note?.hint} notesError={notes.error} retryNotes={notes.retry} running={timer.running} remaining={timer.remaining} onReturn={() => setView('timer')} className={`min-[1360px]:col-start-3 ${view !== 'prompts' ? 'max-[1359px]:hidden [@media(max-height:650px)]:hidden' : ''}`} />}
      </div>
      <TimerManagementDialog timer={timer} />
      <LateCheckinDialog timer={timer} />
    </motion.div>
  );
}