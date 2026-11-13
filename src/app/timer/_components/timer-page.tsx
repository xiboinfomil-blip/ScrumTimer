'use client';
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from 'cn';


import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Users as GroupsRounded } from 'lucide-react';
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
import { useRemotePage } from '@/providers/remote-host-provider';
import { Smartphone as SmartphoneRounded } from 'lucide-react';
import { ScreenShare as ScreenShareRounded } from 'lucide-react';
import { CurrentMoodCard } from './current-mood-card';
import { Wallpaper as WallpaperRounded } from 'lucide-react';
import { TimerScreensaver } from '@/components/ui/timer-screensaver';
import { TeamNavbarActions } from '@/components/layout/team-navbar-actions';

export type StandupTimer = ReturnType<typeof useStandupTimer>;

export function TimerPage() {
  const reduced = useReducedMotion();
  const allowed = useStepGuard('timer');
  const timer = useStandupTimer();
  const [view, setView] = useState<'timer' | 'prompts'>('timer');
  const [presentationView, setPresentationView] = useState<'timer' | 'notes'>('timer');
  const [lineupOpen, setLineupOpen] = useState(false);
  const [lineupPage, setLineupPage] = useState(0);
  const [lineupCapacity, setLineupCapacity] = useState(1);
  const [sharing, setSharing] = useState(false);
  const [blackScreen, setBlackScreen] = useState(false);
  const previousRunning = useRef({ running: timer.running, activeId: timer.activeId });
  useEffect(() => {
    if (previousRunning.current.running && previousRunning.current.activeId === timer.activeId && !timer.running && timer.activeId && !timer.managing && !timer.lateChecking && !lineupOpen && !sharing) setBlackScreen(true);
    if (timer.running) setBlackScreen(false);
    previousRunning.current = { running: timer.running, activeId: timer.activeId };
  }, [timer.running, timer.activeId, timer.managing, timer.lateChecking, lineupOpen, sharing]);
  const [navbarActions, setNavbarActions] = useState<HTMLElement | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  useEffect(() => { setNavbarActions(document.getElementById('timer-navbar-actions')); }, []);
  const panels = useViewMotion(`${view}-${timer.focusMode}`);
  const { activeTeamId, activeTeamName, state, teams } = useTeam();
  const isSprint = teams.find(team => team.id === activeTeamId)?.kind === 'sprint';
  const notes = useDailyHints(activeTeamId);
  const refreshNotes = notes.retry;
  const noteSpeaker = useRef({ teamId: activeTeamId, participantId: timer.activeId });
  useEffect(() => {
    const previous = noteSpeaker.current;
    if (previous.teamId === activeTeamId && notes.loading) return;
    noteSpeaker.current = { teamId: activeTeamId, participantId: timer.activeId };
    if (previous.teamId === activeTeamId && previous.participantId !== timer.activeId) refreshNotes();
  }, [activeTeamId, timer.activeId, notes.loading, refreshNotes]);
  const note = notes.data?.hints.find(hint => hint.participantId === timer.person?.id);
  const target = useRef<HTMLDivElement>(null);
  const presentation = usePresentation(target);
  const waitingForPostponed = !timer.activeId && timer.people.some(person => person.postponed && !person.done);
  const index = timer.people.findIndex(person => person.id === timer.activeId);
  const lineupPages = Math.max(1, Math.ceil(timer.people.length / lineupCapacity));
  const currentLineupPage = Math.min(lineupPage, lineupPages - 1);
  const lineupPagination = { page: currentLineupPage, capacity: lineupCapacity, onPageChange: setLineupPage, onCapacityChange: setLineupCapacity };
  useEffect(() => { setLineupPage(Math.floor(Math.max(0, index) / lineupCapacity)); }, [index, lineupCapacity]);
  const following = [...timer.people.slice(index + 1), ...timer.people.slice(0, Math.max(0, index))].find(person => !person.done && !person.postponed);
  const moodById = new Map(state.roster.map(person => [person.id, person.mood]));
  useRemotePage({
    page: 'timer', participants: timer.people.map(person => ({
      name: person.name, present: true, mood: moodById.get(person.id) ?? null,
      done: person.done, postponed: person.postponed, active: person.id === timer.activeId,
    })), participantPresent: false, participantMood: null, participantIndex: Math.max(0, index), participantCount: timer.people.length, canVote: false, canPostpone: false, canContinue: false,
    speaker: timer.person?.name ?? '', nextSpeaker: following?.name ?? '', teamName: activeTeamName,
    activeId: timer.activeId, running: timer.running, remaining: timer.remaining, deadline: timer.deadline,
    completed: timer.people.filter(person => person.done).length, total: timer.people.length,
    blocked: timer.managing || timer.lateChecking || waitingForPostponed || lineupOpen || sharing || toolsOpen,
    blackScreen, manualPenalty: timer.person?.manualPenalty ?? 0,
    lists: [{ key: 'timer', indices: timer.people.slice(currentLineupPage * lineupCapacity, (currentLineupPage + 1) * lineupCapacity).map((_, offset) => currentLineupPage * lineupCapacity + offset), page: currentLineupPage, pages: lineupPages }],
  }, (action, targetIndex) => {
    switch (action) {
      case 'list-previous': if (targetIndex === 0) setLineupPage(Math.max(0, currentLineupPage - 1)); break;
      case 'list-next': if (targetIndex === 0) setLineupPage(Math.min(lineupPages - 1, currentLineupPage + 1)); break;
      case 'start': setBlackScreen(false); if (!timer.running) timer.toggle(); break;
      case 'pause': if (timer.running) timer.toggle(); break;
      case 'previous': timer.previous(); break;
      case 'next': timer.next(); break;
      case 'restart': timer.restartCurrent(); break;
      case 'penalty': timer.penalize(); break;
      case 'black-screen': if (timer.running) timer.toggle(); setBlackScreen(value => !value); break;
    }
  }, timer.people.map(person => person.id));
  const broadcast = useLiveBroadcast(allowed ? activeTeamId : null, {
    speaker: timer.person?.name ?? '', nextSpeaker: following?.name ?? '', teamName: activeTeamName,
    running: timer.running, remaining: timer.remaining, deadline: timer.deadline,
    completed: timer.people.filter(person => person.done).length, total: timer.people.length,
  });

  if (!allowed) return null;
  if (timer.people.length > 0 && !timer.activeId && timer.people.every(person => person.done)) return <SessionResults timer={{ ...timer, people: roundSpeakers(timer.people) }} />;

  return (
    <motion.div initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : .45, ease: [.22, 1, .36, 1] }} ref={target} id="timer-page" className={`flex min-h-0 flex-1 flex-col gap-3 max-[650px]:gap-2 [@media(max-height:650px)]:gap-0 ${presentation.presenting ? 'fixed inset-x-0 bottom-0 top-[68px] z-[1200] max-w-none! bg-slate-50 p-3 sm:p-6 max-[800px]:top-[105px]' : 'mx-auto w-full'} overflow-hidden`} data-mode={timer.focusMode ? 'speaking' : 'setup'}>
        {navbarActions && createPortal(<TeamNavbarActions onOpenChange={setToolsOpen} timerTools={[
          <DropdownMenuItem key="screensaver" onSelect={() => { if (timer.running) timer.toggle(); setBlackScreen(true); }}><WallpaperRounded />Économiseur d’écran</DropdownMenuItem>,
          <DropdownMenuItem key="lineup" onSelect={() => { if (timer.running) timer.toggle(); setLineupOpen(true); }}><GroupsRounded />Voir le tour de parole</DropdownMenuItem>,
          <DropdownMenuItem key="broadcast" onSelect={() => { if (presentation.presenting) { setPresentationView('timer'); void presentation.toggle(); } else setSharing(true); }}><ScreenShareRounded />{presentation.presenting ? 'Quitter la présentation' : 'Diffusion'}</DropdownMenuItem>,
        ]} />, navbarActions)}
      <TimerScreensaver open={blackScreen} onClose={() => setBlackScreen(false)} onResume={() => { setBlackScreen(false); if (!timer.running) timer.toggle(); }} teamName={activeTeamName} speaker={timer.person?.name ?? ''} />
      <Dialog open={lineupOpen && !timer.lateChecking && !waitingForPostponed} onOpenChange={next => { if (!next) (() => setLineupOpen(false))?.(); }}><DialogContent showCloseButton={false} className="min-h-0 h-[min(640px,_calc(100dvh_-_32px))] w-[calc(100%_-_32px)] rounded-[14px] border-[1px_solid_#dce3e9] max-w-[600px]" aria-labelledby="lineup-dialog-title">
        <DialogTitle id="lineup-dialog-title" className={cn("shrink-0 px-5 pt-5 pb-2", "border-t-2 border-t-accent pb-2! text-lg! font-bold!")}>Le tour de parole</DialogTitle>
        <div className={cn("min-h-0 overflow-y-auto px-5 py-3", "flex min-h-0 flex-1 flex-col")}><p className="mb-3 shrink-0 text-xs text-muted">{timer.focusMode ? 'Votre passage reste sélectionné. Reprenez le minuteur une fois prêt.' : 'Choisissez la personne qui ouvrira le point.'}</p><TeamLineup timer={timer} pagination={lineupPagination} className="flex-1" /></div>
        <DialogFooter><Button onClick={() => setLineupOpen(false)} variant="ghost" className="min-h-[44px]">Revenir au passage</Button></DialogFooter>
      </DialogContent></Dialog>
      <Dialog open={sharing} onOpenChange={next => { if (!next) (() => setSharing(false))?.(); }}><DialogContent showCloseButton={false} className="min-h-0 rounded-[14px] border-[1px_solid_#dce3e9] max-w-[400px]" aria-labelledby="sharing-title">
        <DialogTitle id="sharing-title" className={cn("shrink-0 px-5 pt-5 pb-2", "border-t-2 border-t-accent pb-2! text-lg! font-bold!")}>Diffusion et présentation</DialogTitle>
        <div className="min-h-0 overflow-y-auto px-5 py-3"><div className="flex flex-col gap-2" aria-label="Diffusion et présentation">
        <Button onClick={broadcast.toggle} aria-label={broadcast.enabled ? 'Arrêter le direct' : 'Diffuser en direct'} aria-pressed={broadcast.enabled} variant="ghost" className="min-h-[56px] justify-start border-[1px_solid_#dce3e9] text-left normal-case w-full"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-brand"><ScreenShareRounded /></span><span className="ml-3 grid justify-items-start"><strong className="text-sm">{broadcast.enabled ? 'Arrêter le direct' : 'Diffuser en direct'}</strong><span aria-hidden="true" className="text-[11px] font-normal text-muted">{broadcast.enabled ? 'Interrompre la diffusion du minuteur' : 'Afficher le minuteur sur un écran distant'}</span></span></Button>
        <Button aria-label="Lien spectateur" variant="ghost" asChild className="min-h-[56px] justify-start border-[1px_solid_#dce3e9] text-left normal-case w-full"><Link href={`/spectator?team=${encodeURIComponent(activeTeamId ?? '')}`} target="_blank" rel="noopener noreferrer"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-brand"><SmartphoneRounded /></span><span className="ml-3 grid justify-items-start"><strong className="text-sm">Lien spectateur</strong><span aria-hidden="true" className="text-[11px] font-normal text-muted">Ouvrir une vue en lecture seule</span></span></Link></Button>
        <Button onClick={() => { setSharing(false); setPresentationView('timer'); void presentation.toggle(); }} aria-label={presentation.presenting ? 'Quitter la présentation' : 'Présentation'} aria-pressed={presentation.presenting} variant="ghost" className="min-h-[56px] justify-start border-[1px_solid_#dce3e9] text-left normal-case w-full"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-orange-50 text-amber-800"><ScreenShareRounded /></span><span className="ml-3 grid justify-items-start"><strong className="text-sm">{presentation.presenting ? 'Quitter la présentation' : 'Présentation'}</strong><span aria-hidden="true" className="text-[11px] font-normal text-muted">{presentation.presenting ? 'Revenir à la page complète' : 'Afficher le minuteur en plein écran'}</span></span></Button>
        <span role="status" className="text-xs text-muted">{broadcast.enabled ? broadcast.status : presentation.notice}</span>
        </div></div><DialogFooter><Button onClick={() => setSharing(false)} variant="ghost">Fermer</Button></DialogFooter>
      </DialogContent></Dialog>
      {presentation.presenting ? <ScreenTabs
        className={`${segmentedTabs} h-13 border border-slate-200/70 p-1 [&>button]:min-h-11 max-[1099px]:flex min-[1100px]:hidden [@media(max-height:650px)]:flex [@media(max-height:650px)]:h-9 [@media(max-height:650px)]:border-0 [@media(max-height:650px)]:p-0 [@media(max-height:650px)]:[&>button]:!min-h-9`}
        label="Présentation du point quotidien"
        value={presentationView}
        onChange={setPresentationView}
        tabs={[{ value: 'timer', label: 'Minuteur' }, { value: 'notes', label: 'Pense-bête' }]}
      /> : <ScreenTabs
        className={`${segmentedTabs} h-13 border border-slate-200/70 p-1 [&>button]:min-h-11 max-[1099px]:flex min-[1100px]:hidden [@media(max-height:650px)]:flex [@media(max-height:650px)]:h-9 [@media(max-height:650px)]:border-0 [@media(max-height:650px)]:p-0 [@media(max-height:650px)]:[&>button]:!min-h-9`}
        label="Espace du point quotidien"
        value={view}
        onChange={setView}
        tabs={[{ value: 'timer', label: 'Minuteur' }, { value: 'prompts', label: isSprint ? 'Tickets & pense-bête' : 'Pense-bête & humeur' }]}
      />}
      <div ref={panels} className="workspace grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-1 items-stretch gap-3 overflow-hidden max-[650px]:gap-2 min-[1100px]:grid-cols-[minmax(0,1.35fr)_minmax(320px,.75fr)] min-[1100px]:gap-4 [@media(max-height:650px)]:grid-cols-1" data-view={presentation.presenting ? presentationView : view}>
        <TimerPanel notes={notes} timer={{ ...timer, manage: () => { if (presentation.presenting) void presentation.toggle(); timer.manage(); } }} className={`min-[1100px]:col-start-1 ${presentation.presenting ? presentationView === 'notes' ? 'max-[1099px]:hidden [@media(max-height:650px)]:hidden' : '' : view !== 'timer' ? 'max-[1099px]:hidden [@media(max-height:650px)]:hidden' : ''}`} />
        <aside aria-label="Pense-bête et humeur" className={`notes-rail grid min-h-0 min-w-0 ${isSprint ? 'grid-rows-[minmax(min(520px,100%),1fr)_auto] overflow-y-auto' : 'grid-rows-[minmax(0,1fr)_auto] overflow-hidden'} gap-3 min-[1100px]:border-l min-[1100px]:border-line min-[1100px]:pl-3 [@media(max-height:650px)]:gap-1 ${presentation.presenting ? presentationView === 'timer' ? 'max-[1099px]:hidden [@media(max-height:650px)]:hidden' : '' : view !== 'prompts' ? 'max-[1099px]:hidden [@media(max-height:650px)]:hidden' : ''}`}>
          <DailyPrompts compact={timer.focusMode} speakerId={timer.activeId} note={note?.hint} notesError={notes.error} retryNotes={notes.retry} running={timer.running} remaining={timer.remaining} onReturn={() => presentation.presenting ? setPresentationView('timer') : setView('timer')} />
          <CurrentMoodCard compact={timer.focusMode} timer={timer} />
        </aside>
      </div>
      <TimerManagementDialog timer={timer} />
      <LateCheckinDialog timer={timer} autoOpen={waitingForPostponed} />
    </motion.div>
  );
}