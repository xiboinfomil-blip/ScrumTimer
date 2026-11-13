'use client';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';

import { cn } from 'cn';


import { Button, Button as IconButton } from '@/components/ui/button';
import { UserRoundPlus as PersonAddAltRounded } from 'lucide-react';
import { Check as CheckIcon } from 'lucide-react';
import { CircleAlert as ErrorOutlineIcon } from 'lucide-react';
import { Clock as AccessTimeIcon } from 'lucide-react';
import { CircleDot as RadioButtonCheckedIcon } from 'lucide-react';
import { ArrowUpRight as NorthEastIcon } from 'lucide-react';
import { Settings as SettingsRounded } from 'lucide-react';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader } from '@infomil/scrum-shared/ui';
import type { useDailyHints } from '@/hooks/meeting/use-daily-hints';
import { timerUrgency } from '@/lib/timer/timer';
import type { StandupTimer } from './timer-page';
import { previousSpeaker } from '@/lib/timer/timer-checkpoint';
import { TimerIcon } from './timer-icon';

const ParticipantNote = dynamic(() => import('@/components/ui/participant-note').then(module => module.ParticipantNote), {
  loading: () => <Loader size="sm" label="Chargement de la note…" />,
});

const dialMarks = Array.from({ length: 60 }, (_, index) => <line key={index} x1="100" y1="9" x2="100" y2={index % 5 === 0 ? 17 : 12} transform={`rotate(${index * 6} 100 100)`} stroke="currentColor" strokeWidth={index % 5 === 0 ? 1.4 : .7} opacity={index % 5 === 0 ? .55 : .22} strokeLinecap="round" />);

export function ActiveSpeaker({ timer }: { timer: StandupTimer }) {
  const person = timer.person;
  const position = timer.people.findIndex(candidate => candidate.id === timer.activeId) + 1;
  return <header data-active-speaker className="relative col-span-full flex min-w-0 flex-col items-center justify-center px-12 py-2 text-center [@media(max-height:650px)]:py-1" aria-labelledby="speaker-name">
    <div id={timer.focusMode ? 'speaker-turn-cue' : undefined} role="status" aria-live="polite" aria-atomic="true" className="w-full min-w-0">
      <p className="flex items-center justify-center gap-2 text-[10px] font-semibold text-muted"><span aria-hidden="true" className={`size-1.5 rounded-full ${timer.running ? 'bg-success motion-safe:animate-pulse' : 'bg-accent'}`} /><span>{timer.running ? 'À la parole' : timer.turnStarted ? 'Passage en pause' : 'À vous de jouer'}</span><span aria-hidden="true" className="h-3 w-px bg-line" /><span className="tabular-nums">{position > 0 ? `${position} / ${timer.people.length}` : 'En attente'}</span></p>
      <h2 id="speaker-name" title={person?.name} className="mx-auto mt-1.5 max-w-full line-clamp-2 text-4xl font-extrabold leading-tight text-[#173c51] [overflow-wrap:anywhere] max-[650px]:text-[28px] [@media(max-height:650px)]:mt-0 [@media(max-height:650px)]:text-2xl">{person?.name ?? 'Personnes reportées'}</h2>
    </div>
    {person && <TooltipProvider><Tooltip disableHoverableContent><TooltipTrigger asChild><IconButton type="button" aria-label={`Reporter le passage de ${person.name}`} onClick={() => timer.postpone(person.id)} className="absolute! top-1! right-0! size-11! text-brand! hover:bg-blue-50!" variant="ghost" size="icon"><TimerIcon name="later" className="size-5" /><span className="sr-only">Reporter ce passage</span></IconButton></TooltipTrigger><TooltipContent>{"Reporter ce passage"}</TooltipContent></Tooltip></TooltipProvider>}
  </header>;
}

export function TimerPanel({ timer, notes, className = '' }: { timer: StandupTimer; notes: ReturnType<typeof useDailyHints>; className?: string }) {
  const reduced = useReducedMotion();
  const { people, person, remaining, turnTotal, running, ended, warning, turnStarted } = timer;
  const [readingNote, setReadingNote] = useState(false);
  const note = notes.data?.hints.find(hint => hint.participantId === person?.id);
  const previous = previousSpeaker(timer);
  const index = people.findIndex(candidate => candidate.id === timer.activeId);
  const next = [...people.slice(index + 1), ...people.slice(0, Math.max(0, index))].find(candidate => candidate.id !== timer.activeId && !candidate.done && !candidate.postponed);
  const waiting = people.filter(candidate => candidate.postponed && !candidate.done).length;

  const seconds = Math.ceil(Math.abs(remaining));
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const urgency = timerUrgency(remaining, warning, ended, turnStarted);
  const critical = urgency === 'critical';
  const nearly = urgency === 'warning' || critical;
  const complete = people.length > 0 && !person && people.every(person => person.done);
  const status = complete ? 'Tour terminé' : !person && people.some(p => p.postponed) ? 'Personnes en attente' : ended ? 'Temps écoulé' : running ? critical ? 'Concluez maintenant' : nearly ? 'Bientôt la fin' : 'À la parole' : turnStarted ? 'En pause' : 'Prêt à démarrer';
  const feedback = complete ? 'Tout le monde a eu la parole. Bonne journée !' : ended ? 'Concluez puis Suivant : le prochain minuteur démarrera.' : critical ? 'Dernières secondes : terminez votre phrase.' : nearly ? 'Le temps diminue : préparez votre conclusion.' : running ? 'Suivant lance immédiatement le prochain passage.' : 'Cliquez sur Démarrer lorsque vous prenez la parole.';
  const ratio = turnTotal > 0 ? Math.min(1, Math.max(0, remaining / turnTotal)) : 0;
  const statusColor = ended || critical ? 'border-red-200 bg-danger-soft text-danger' : nearly ? 'border-orange-200 bg-orange-50 text-amber-800' : complete ? 'border-green-200 bg-success-soft text-success' : running || !turnStarted ? 'border-blue-200 bg-blue-50 text-brand' : 'border-orange-200 bg-orange-50 text-amber-800';
  const feedbackColor = complete ? 'text-success' : ended || critical ? 'font-semibold text-danger' : nearly ? 'text-amber-800' : 'text-muted';
  const pulse = running && critical ? 'motion-safe:animate-critical-glow' : running && nearly ? 'motion-safe:animate-warning-glow' : '';
  const FeedbackIcon = complete ? CheckIcon : ended ? ErrorOutlineIcon : nearly ? AccessTimeIcon : running ? RadioButtonCheckedIcon : NorthEastIcon;
  return (
    <section className={`timer-panel relative isolate grid min-h-0 min-w-0 grid-cols-1 ${timer.focusMode ? 'grid-rows-[auto_auto_minmax(112px,1fr)_auto_auto]' : 'grid-rows-[auto_auto_minmax(112px,1fr)_auto_auto_auto]'} items-center gap-3 overflow-x-hidden overflow-y-auto rounded-none! border-0! bg-transparent! px-5 py-3 text-center shadow-none! max-[650px]:gap-2 max-[650px]:px-0 max-[650px]:py-1 [@media(max-height:650px)]:gap-0 [@media(max-height:650px)]:py-0 ${ended ? 'finished' : nearly ? 'warning' : ''} ${running ? 'running' : ''} ${complete ? 'session-complete' : ''} ${className}`} data-urgency={urgency} aria-labelledby="speaker-name">
      <div data-speaker-navigation className="col-span-full grid min-w-0 grid-cols-2 items-stretch gap-3 max-[650px]:gap-2 [@media(max-height:650px)]:[&>div>button]:h-12">
        <div className="grid min-w-0 content-start">
        <Button className="group h-17 min-w-0! justify-start! gap-3! overflow-hidden rounded-lg! border! border-control! bg-white! px-3! text-left! normal-case! hover:bg-blue-50! disabled:bg-slate-50! max-[650px]:h-16 max-[650px]:gap-2! max-[650px]:px-2! [@media(max-height:650px)]:h-12" type="button" id="previous-button" disabled={!timer.canPrevious} onClick={timer.previous} aria-label="Précédent" aria-describedby="previous-speaker" title={previous ? `Revenir à ${previous.name}` : 'Début du tour'} variant="ghost"><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-[#edf3f8] text-brand group-disabled:bg-slate-100 group-disabled:text-muted max-[360px]:size-8"><TimerIcon name="back" className="size-5" /></span><span className="grid min-w-0 flex-1 gap-0.5"><span className="text-[10px] font-medium text-muted">Précédent</span><span id="previous-speaker" className="line-clamp-2 min-w-0 text-lg font-bold leading-tight text-ink [overflow-wrap:anywhere] max-[650px]:text-sm [@media(max-height:650px)]:line-clamp-1 [@media(max-height:650px)]:text-sm">{previous?.name ?? 'Début du tour'}</span></span></Button>
        </div>
        <div className="grid min-w-0 content-start">
        <Button type="button" id="next-button" className="group h-17 min-w-0! justify-between! gap-3! overflow-hidden rounded-lg! border! border-[#bb752c]! bg-[#fff8ef]! px-3! text-left! normal-case! hover:bg-orange-100! disabled:border-slate-300! disabled:bg-slate-100! max-[650px]:h-16 max-[650px]:gap-2! max-[650px]:px-2! [@media(max-height:650px)]:h-12" disabled={!person} onClick={timer.next} aria-label="Suivant" aria-describedby="upcoming-speaker" title={next ? `Donner la parole à ${next.name}` : 'Terminer les passages disponibles'} aria-keyshortcuts="N" variant="ghost"><span className="grid min-w-0 flex-1 gap-0.5"><span className="text-[10px] font-medium text-[#8f4309]">À suivre</span><span id="upcoming-speaker" className="line-clamp-2 min-w-0 text-lg font-bold leading-tight text-ink [overflow-wrap:anywhere] max-[650px]:text-sm [@media(max-height:650px)]:line-clamp-1 [@media(max-height:650px)]:text-sm">{next?.name ?? 'Fin du tour'}</span></span><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-[#a84f0b] text-white group-disabled:bg-slate-300 group-disabled:text-slate-600 max-[360px]:size-8"><TimerIcon name="next" className="size-5" /></span></Button>
        </div>
      </div>
      <ActiveSpeaker timer={timer} />
      <div id="timer-stage" key={`${timer.activeId}-${timer.focusMode}`} className="row-start-3 flex min-h-0 min-w-0 flex-col items-center justify-center self-stretch overflow-hidden bg-transparent text-ink [container-type:inline-size]">
        <motion.div initial={reduced ? false : { opacity: 0, scale: .94, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: reduced ? 0 : .6, ease: [.22, 1, .36, 1] }} data-testid="stopwatch-timer" data-urgency={urgency} className={`relative h-full max-h-[min(31rem,108cqw)] min-h-0 w-full max-w-[30rem] flex-1 self-center [container-type:size] ${ended || critical ? 'text-danger' : nearly ? 'text-amber-800' : 'text-brand'} ${pulse}`}>
          <div data-timer-dial className="absolute left-1/2 top-[54%] size-[min(92cqw,88cqh)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#b8cbd8] bg-[linear-gradient(145deg,#ffffff_0%,#e1e9ef_45%,#ffffff_100%)] shadow-[0_12px_30px_-16px_#173c5138,inset_0_1px_0_#ffffff] [container-type:size]">
            <div aria-hidden="true" data-stopwatch-crown className="absolute -top-[11%] left-1/2 -z-10 h-[13%] w-[18%] -translate-x-1/2">
              <span className="absolute inset-x-[25%] bottom-0 h-[68%] rounded-t-sm border border-[#b8cbd8] bg-[#dce6ee]" />
              <span className="absolute inset-x-0 top-0 h-[50%] rounded-[3px] border border-[#bc6817] bg-[repeating-linear-gradient(90deg,#ec8b23_0px,#ec8b23_3px,#d67a19_3px,#d67a19_4px)] shadow-[inset_0_2px_0_#ffffff66,0_2px_3px_#173c5115]" />
            </div>
            <span aria-hidden="true" className="absolute -right-[1%] top-[6%] -z-10 h-[6%] w-[13%] rotate-45 rounded-[3px] border border-[#b8cbd8] bg-[linear-gradient(#ffffff,#dce6ee)]" />
            <div aria-hidden="true" className="absolute inset-[2%] rounded-full border border-white bg-[#fbfdff] shadow-[inset_0_0_24px_#dce6ee80]" />
            <div aria-hidden="true" className="absolute inset-[24%] rounded-full bg-white shadow-[0_0_24px_#205f9d05]" />
            <svg aria-hidden="true" viewBox="0 0 200 200" className="absolute inset-0 size-full text-[#46697f]" fill="none">{dialMarks}<circle cx="100" cy="100" r="60" stroke="currentColor" strokeWidth=".5" strokeDasharray=".5 3" opacity=".2" /></svg>
            <span aria-hidden="true" className="absolute left-1/2 top-[4.5%] h-[4%] w-[1.4%] -translate-x-1/2 rounded-full bg-accent" />
            <div aria-hidden="true" className="absolute inset-[11%]">
              <svg data-timer-ring viewBox="0 0 44 44" fill="none" className="absolute inset-0 size-full -rotate-90">
                <circle data-timer-track cx="22" cy="22" r="20.6" stroke="currentColor" strokeWidth="1.1" className="text-[#e5edf3]" />
                <circle data-timer-progress cx="22" cy="22" r="20.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - ratio} className="transition-[stroke-dashoffset] duration-300 ease-linear motion-reduce:transition-none" />
              </svg>
              <div data-stopwatch-indicator className="absolute inset-0 rounded-full transition-transform duration-300 ease-linear motion-reduce:transition-none" style={{ transform: `rotate(${(ratio - 1) * 360}deg)` }}>
                <span className="absolute left-1/2 top-[3.2%] size-[5%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_2px_#ffffff,0_2px_4px_#173c5130]" />
              </div>
            </div>
            <div data-stopwatch-readout className="pointer-events-none absolute inset-[17%] flex min-w-0 flex-col items-center justify-center gap-2 [@media(max-height:650px)]:gap-0.5">
              <span id="timer-label" className="text-[11px] font-medium text-muted max-[650px]:text-[10px] [@media(max-height:650px)]:text-[9px]">{ended ? 'Dépassement' : critical ? 'Concluez maintenant' : nearly ? 'Bientôt la fin' : running ? 'Temps restant' : 'Temps par personne'}</span>
              <span id="timer-display" className="block whitespace-nowrap text-[min(5.5rem,20cqw,22cqh)] font-bold leading-none tabular-nums" role="timer" aria-live="off" aria-label={`${ended ? 'Dépassement' : 'Temps restant'} : ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} et ${secs} ${secs === 1 ? 'seconde' : 'secondes'}`}>
                {ended ? '+' : ''}{String(minutes).padStart(2, '0')}:{String(secs).padStart(2, '0')}
              </span>
              <span aria-hidden="true" className="mt-1 flex items-center gap-1.5 text-[9px] font-semibold text-muted [@media(max-height:650px)]:hidden"><span className={`size-1 rounded-full ${running ? 'bg-success motion-safe:animate-pulse' : 'bg-accent'}`} />{complete ? 'Terminé' : running ? 'En cours' : turnStarted ? 'En pause' : 'Prêt'}</span>
            </div>
          </div>
        </motion.div>
        <div className="sr-only" role="progressbar" aria-label="Temps écoulé" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((1 - ratio) * 100)} />
      </div>
      <div data-timer-controls className="col-span-full grid min-h-[84px] w-full min-w-0 grid-cols-[minmax(0,1fr)_116px_minmax(0,1fr)] items-center gap-2 border-t border-[#d7e1ea] pt-3 max-[650px]:grid-cols-[minmax(0,1fr)_104px_minmax(0,1fr)] [@media(max-height:650px)]:min-h-[72px] [@media(max-height:650px)]:pt-1">
        <div className="flex min-w-0 flex-col items-start gap-1 text-left">
          <span className="text-[11px] font-semibold tabular-nums text-ink">{person ? `Passage ${people.findIndex(candidate => candidate.id === person.id) + 1} / ${people.length}` : 'Terminé'}</span>
          <div className="flex min-w-0 items-center gap-1">
            <span className={`flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium max-[650px]:sr-only ${statusColor}`} id="status-pill" data-status={status} role="status"><span className={`size-1.5 shrink-0 rounded-full bg-current ${running ? 'motion-safe:animate-pulse' : ''} motion-reduce:animate-none`} aria-hidden="true" />{status}</span>
          </div>
        </div>
        <Button type="button" id="start-button" className="mx-auto size-16! min-w-0! flex-col! gap-0.5! rounded-full! border! border-white/40! px-1! text-[11px]! font-bold! shadow-[inset_0_1px_0_#ffffff40,0_6px_16px_-4px_#205f9d55]!" disabled={!person} onClick={timer.toggle} aria-keyshortcuts="Space" variant="default">
          <TimerIcon name={running ? 'pause' : 'play'} className="size-5 shrink-0" /><span className="truncate">{running ? 'Pause' : turnStarted ? 'Reprendre' : 'Démarrer'}</span>
        </Button>
        <div className="flex min-w-0 items-center justify-end gap-1">
          {person && <Button onClick={() => setReadingNote(true)} aria-label={`Lire la note de ${person.name}`} title="Pense-bête" variant="ghost" className="min-h-[44px] min-w-[44px] px-[8px] text-[10px] normal-case"><TimerIcon name="edit" className="size-3.5" /><span className="ml-1 max-[650px]:hidden">Pense-bête</span></Button>}
          <IconButton id="manage-timer-button" type="button" aria-label={timer.focusMode ? 'Modifier les réglages' : 'Réglages'} title={timer.focusMode ? 'Modifier les réglages' : 'Réglages'} onClick={timer.manage} variant="ghost" size="icon" className="w-[44px] h-[44px]"><SettingsRounded size={20} /></IconButton>
        </div>
      </div>
      <div role="group" aria-label="Gestion de la file d’attente" data-queue-actions className="col-span-full flex min-h-11 min-w-0 items-center justify-between gap-2 border-t border-line px-1">
        {waiting > 0 ? <Button aria-label="En attente" title={`${waiting} personne${waiting > 1 ? 's' : ''} en attente`} onClick={timer.openLateCheckin} className="h-11! min-w-0! shrink-0! gap-1! px-1! text-[11px]! font-bold! normal-case! text-brand!" variant="ghost"><PersonAddAltRounded size={20} />En attente<span className="grid min-w-5 place-items-center rounded bg-white px-1 text-[11px] tabular-nums">{waiting}</span></Button> : <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-muted"><PersonAddAltRounded size={20} />File d’attente</span>}
        {next && <Button data-postpone-next aria-label={`Reporter le prochain passage de ${next.name}`} title={`Reporter le prochain passage de ${next.name}`} onClick={() => timer.postpone(next.id)} className="h-11! min-w-0! flex-1! justify-end! gap-1! px-1! text-left! normal-case! text-[#8f4309]!" variant="ghost"><TimerIcon name="later" className="size-4 shrink-0" /><span className="grid min-w-0"><span className="text-[9px] font-medium text-muted">Prochain passage</span><span className="truncate text-[11px] font-bold">Reporter {next.name}</span></span></Button>}
      </div>
      <div id="timer-feedback" className={`sr-only ${feedbackColor}`}>
        {ended && <span id="time-up-alert" role="alert">{person?.name}, Temps utilisé. Merci de passer la parole.</span>}
        <FeedbackIcon id="feedback-icon" className={`size-4 shrink-0 ${complete ? 'text-success' : ended ? 'text-danger' : nearly ? 'text-amber-700' : 'text-brand'}`} size={16} aria-hidden="true" />
        <span id="feedback-text">{feedback}</span>
      </div>
      <div className={`${timer.focusMode ? 'hidden' : 'flex'} min-h-11 min-w-0 items-center justify-between gap-2 border-t border-line text-[11px] text-muted [@media(max-height:650px)]:hidden`}><span className="flex min-w-0 items-center gap-1.5"><TimerIcon name="timer" className="size-3.5 shrink-0" />{`${Math.floor(timer.duration / 60)} min ${timer.duration % 60 ? `${timer.duration % 60} s` : ''} par personne`}</span>{!timer.focusMode && <IconButton type="button" id="reset-button" aria-label="Réinitialiser le minuteur de la personne qui parle" title="Réinitialiser le minuteur (R)" onClick={timer.reset} aria-keyshortcuts="R" variant="ghost" size="icon" className="w-[44px] h-[44px]"><TimerIcon name="reset" /></IconButton>}</div>
      <Dialog open={readingNote} onOpenChange={next => { if (!next) (() => setReadingNote(false))?.(); }}><DialogContent showCloseButton={false} className="min-h-0 max-h-[calc(100dvh_-_24px)] border-[1px_solid_#dce3e9] rounded-[14px] max-w-[600px]" aria-labelledby="speaker-note-title">
        <DialogTitle id="speaker-note-title" className={cn("shrink-0 px-5 pt-5 pb-2", "border-t-2 border-t-accent pb-2! text-lg! font-bold!")}>Le pense-bête de {person?.name ?? 'ce participant'}</DialogTitle>
        <div className="min-h-0 overflow-y-auto px-5 py-3 border-y border-line">
          <p className="mb-3 text-[11px] text-muted">Note partagée avec l’équipe · aujourd’hui, heure de Maurice. Le minuteur garde son état : ouvrir cette note ne le suspend pas.</p>
          {notes.loading ? <div className="grid min-h-32 place-items-center"><Loader label="Chargement de la note…" /></div> : notes.error ? <div role="alert"><p>{notes.error}</p><Button onClick={notes.retry} variant="ghost">Réessayer</Button></div> : <ParticipantNote hint={note?.hint ?? 'Aucun pense-bête préparé pour aujourd’hui.'} />}
        </div>
        <DialogFooter className="border-t border-line"><Button onClick={() => setReadingNote(false)} variant="ghost" className="min-h-[44px]">Fermer</Button></DialogFooter>
      </DialogContent></Dialog>
    </section>
  );
}