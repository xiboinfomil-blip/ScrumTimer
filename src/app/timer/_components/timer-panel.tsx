'use client';

import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper } from '@mui/material';
import PersonAddAltRounded from '@mui/icons-material/PersonAddAltRounded';
import TimerRounded from '@mui/icons-material/TimerRounded';
import CheckIcon from '@mui/icons-material/Check';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineRounded';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import SettingsRounded from '@mui/icons-material/SettingsRounded';
import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader } from '@infomil/scrum-shared/ui';
import type { useDailyHints } from '@/hooks/meeting/use-daily-hints';
import { ParticipantNote } from '@/components/ui/participant-note';
import { timerUrgency } from '@/lib/timer/timer';
import type { StandupTimer } from './timer-page';
import { previousSpeaker } from '@/lib/timer/timer-checkpoint';
import { TimerIcon } from './timer-icon';

export function ActiveSpeaker({ timer }: { timer: StandupTimer }) {
  const person = timer.person;
  const position = timer.people.findIndex(candidate => candidate.id === timer.activeId) + 1;
  return <header data-active-speaker className="col-span-full flex min-w-0 flex-col items-center justify-center gap-0.5 py-1 text-center" aria-labelledby="speaker-name">
    <div id={timer.focusMode ? 'speaker-turn-cue' : undefined} role="status" aria-live="polite" aria-atomic="true" className="w-full min-w-0">
      <p className="flex items-center justify-center gap-2 text-[11px] font-semibold text-muted"><span aria-hidden="true" className={`size-1.5 rounded-full ${timer.running ? 'bg-success motion-safe:animate-pulse' : 'bg-accent'}`} /><span>{timer.running ? 'À la parole' : timer.turnStarted ? 'Passage en pause' : 'Intervenant actif'}</span><span aria-hidden="true" className="h-3 w-px bg-line" /><span className="tabular-nums">{position > 0 ? `${position} / ${timer.people.length}` : 'En attente'}</span></p>
      <h2 id="speaker-name" title={person?.name} className="mx-auto mt-1 max-w-full line-clamp-2 break-words text-[32px] font-extrabold leading-tight text-brand max-[650px]:text-2xl [@media(max-height:650px)]:text-xl">{person?.name ?? 'Personnes reportées'}</h2>
    </div>
    {person && <Button variant="text" type="button" aria-label={`Reporter le passage de ${person.name}`} onClick={() => timer.postpone(person.id)} startIcon={<TimerIcon name="later" className="size-3.5" />} className="min-h-11! min-w-0! max-w-full! rounded-md! px-2! text-[11px]! font-medium! normal-case! text-muted!"><span>Reporter ce passage</span></Button>}
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
    <Paper component="section" elevation={0} className={`timer-panel relative isolate grid min-h-0 min-w-0 grid-cols-1 ${timer.focusMode ? 'grid-rows-[auto_auto_minmax(0,1fr)_auto]' : 'grid-rows-[auto_auto_minmax(0,1fr)_auto_auto]'} items-center gap-3 overflow-hidden rounded-none! border-0! bg-transparent! px-3 py-2 text-center shadow-none! max-[650px]:gap-2 max-[650px]:px-0 [@media(max-height:650px)]:gap-1 [@media(max-height:650px)]:py-0 ${ended ? 'finished' : nearly ? 'warning' : ''} ${running ? 'running' : ''} ${complete ? 'session-complete' : ''} ${className}`} data-urgency={urgency} aria-labelledby="speaker-name">
      <div data-speaker-navigation className="col-span-full grid min-w-0 grid-cols-2 items-stretch gap-3 max-[650px]:gap-2">
        <div className="grid min-w-0 content-start grid-rows-[auto_44px]">
        <Button variant="text" className="group h-22 min-w-0! justify-start! gap-3! overflow-hidden rounded-lg! border! border-control! bg-white! px-3! text-left! normal-case! hover:bg-blue-50! disabled:bg-slate-100! max-[650px]:h-20 max-[650px]:gap-2! max-[650px]:px-2! [@media(max-height:650px)]:h-14" type="button" id="previous-button" disabled={!timer.canPrevious} onClick={timer.previous} aria-label="Précédent" aria-describedby="previous-speaker" title={previous ? `Revenir à ${previous.name}` : 'Début du tour'}><span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full border border-brand/20 bg-blue-50 text-brand group-disabled:border-slate-300 group-disabled:bg-slate-200 group-disabled:text-slate-600 max-[360px]:size-8"><TimerIcon name="back" className="size-5" /></span><span className="grid min-w-0 flex-1 gap-1"><span className="text-[10px] font-bold uppercase text-muted">Précédent</span><span id="previous-speaker" className="line-clamp-2 min-w-0 break-words text-2xl font-extrabold leading-tight text-ink max-[650px]:text-lg [@media(max-height:650px)]:line-clamp-1 [@media(max-height:650px)]:text-base">{previous?.name ?? 'Début du tour'}</span></span></Button>
          {waiting > 0 ? <Button aria-label="En attente" onClick={timer.openLateCheckin} startIcon={<PersonAddAltRounded fontSize="small" />} className="h-11! min-w-0! justify-start! px-2! text-[11px]! normal-case!">En attente · {waiting}</Button> : <span aria-hidden="true" />}
        </div>
        <div className="grid min-w-0 content-start grid-rows-[auto_44px]">
        <Button variant="text" type="button" id="next-button" className="group h-22 min-w-0! justify-between! gap-3! overflow-hidden rounded-lg! border! border-[#a84f0b]! bg-[#fff3e3]! px-3! text-left! normal-case! hover:bg-orange-100! disabled:border-slate-300! disabled:bg-slate-100! max-[650px]:h-20 max-[650px]:gap-2! max-[650px]:px-2! [@media(max-height:650px)]:h-14" disabled={!person} onClick={timer.next} aria-label="Suivant" aria-describedby="upcoming-speaker" title={next ? `Donner la parole à ${next.name}` : 'Terminer les passages disponibles'} aria-keyshortcuts="N"><span className="grid min-w-0 flex-1 gap-1"><span className="text-[10px] font-bold uppercase text-[#8f4309]">À suivre</span><span id="upcoming-speaker" className="line-clamp-2 min-w-0 break-words text-2xl font-extrabold leading-tight text-ink max-[650px]:text-lg [@media(max-height:650px)]:line-clamp-1 [@media(max-height:650px)]:text-base">{next?.name ?? 'Fin du tour'}</span></span><span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-[#a84f0b] text-white group-disabled:bg-slate-300 group-disabled:text-slate-600 max-[360px]:size-8"><TimerIcon name="next" className="size-5" /></span></Button>
          {next ? <Button data-postpone-next aria-label={`Reporter le prochain passage de ${next.name}`} title={`Reporter le prochain passage de ${next.name}`} onClick={() => timer.postpone(next.id)} startIcon={<TimerIcon name="later" className="size-3.5" />} className="h-11! min-w-0! justify-end! gap-1! px-2! text-left! normal-case! text-[#8f4309]!"><span className="grid min-w-0"><span className="text-[9px] font-medium text-muted">Prochain passage</span><span className="truncate text-[11px] font-semibold">Reporter {next.name}</span></span></Button> : <span aria-hidden="true" />}
        </div>
      </div>
      <ActiveSpeaker timer={timer} />
      <div id="timer-stage" key={`${timer.activeId}-${timer.focusMode}`} className="row-start-3 flex min-h-0 min-w-0 flex-col items-center justify-center gap-3 self-stretch overflow-hidden bg-transparent text-ink [container-type:inline-size] max-[650px]:gap-2 [@media(max-height:650px)]:gap-0">
        <motion.div initial={reduced ? false : { opacity: 0, scale: .94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? 0 : .5, delay: reduced ? 0 : .08, ease: [.22, 1, .36, 1] }} data-testid="stopwatch-timer" data-urgency={urgency} className={`relative grid h-full max-h-[min(24rem,100cqw)] min-h-0 w-full max-w-96 flex-1 place-items-center self-center [container-type:size] ${ended || critical ? 'text-danger' : nearly ? 'text-amber-700' : 'text-brand'} ${pulse}`}>
          <div className="relative size-[min(100cqw,100cqh)] rounded-full border border-brand/10 bg-[#e8f0f6] p-2" aria-hidden="true">
            <div className="absolute inset-[8%] rounded-full bg-white" />
            <span className="absolute left-1/2 top-[11%] h-2 w-0.5 -translate-x-1/2 rounded-full bg-current/30" />
            <span className="absolute bottom-[11%] left-1/2 h-2 w-0.5 -translate-x-1/2 rounded-full bg-current/30" />
            <span className="absolute left-[11%] top-1/2 h-0.5 w-2 -translate-y-1/2 rounded-full bg-current/30" />
            <span className="absolute right-[11%] top-1/2 h-0.5 w-2 -translate-y-1/2 rounded-full bg-current/30" />
            <CircularProgress variant="determinate" value={100} size="100%" thickness={2} className="absolute inset-0 text-brand/10" />
            <CircularProgress variant="determinate" value={ratio * 100} size="100%" thickness={3.5} color="inherit" className="absolute inset-0 motion-reduce:[&_.MuiCircularProgress-circle]:transition-none" sx={{ '& circle': { strokeLinecap: 'round' } }} />
          </div>
          <div className="pointer-events-none absolute inset-0 flex min-w-0 flex-col items-center justify-center gap-1 px-2">
            <TimerRounded className="text-current max-[650px]:hidden [@media(max-height:650px)]:hidden" />
            <span id="timer-label" className="text-sm font-semibold max-[650px]:text-xs [@media(max-height:650px)]:text-[10px]">{ended ? 'Dépassement' : critical ? 'Concluez maintenant' : nearly ? 'Bientôt la fin' : running ? 'Temps restant' : 'Temps par personne'}</span>
            <motion.span key={seconds} initial={reduced ? false : { opacity: .8, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .18 }} id="timer-display" className="block text-[min(4.5rem,23cqw,23cqh)] font-bold leading-none tabular-nums" role="timer" aria-live="off" aria-label={`${ended ? 'Dépassement' : 'Temps restant'} : ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} et ${secs} ${secs === 1 ? 'seconde' : 'secondes'}`}>
              {ended ? '+' : ''}{String(minutes).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </motion.span>
          </div>
        </motion.div>
        <div className="sr-only" role="progressbar" aria-label="Temps écoulé" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((1 - ratio) * 100)} />
      </div>
      <div data-timer-controls className="col-span-full grid min-h-[92px] w-full min-w-0 grid-cols-[minmax(0,1fr)_clamp(76px,26vw,112px)_minmax(0,1fr)] items-center gap-1 border-t border-[#d7e1ea] pt-3 [@media(max-height:650px)]:min-h-[80px] [@media(max-height:650px)]:pt-1">
        <div className="flex min-w-0 flex-col items-start gap-1 text-left">
          <span className="border-l-2 border-accent pl-2 text-xs font-bold tabular-nums text-ink">{person ? `Passage ${people.findIndex(candidate => candidate.id === person.id) + 1} / ${people.length}` : 'Terminé'}</span>
          <div className="flex min-w-0 items-center gap-1">
            <span className={`flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-1.5 text-xs font-semibold max-[650px]:sr-only ${statusColor}`} id="status-pill" data-status={status} role="status"><span className={`size-1.5 shrink-0 rounded-full bg-current ${running ? 'motion-safe:animate-pulse' : ''} motion-reduce:animate-none`} aria-hidden="true" />{status}</span>
          </div>
        </div>
        <Button disableElevation variant="contained" sx={{ minHeight: 58, minWidth: 0, width: '100%', maxWidth: 112, px: 1, borderRadius: '999px', textTransform: 'none', fontSize: 12, fontWeight: 800, flexDirection: 'row', gap: .75, boxShadow: '0 5px 14px #205f9d30' }} type="button" id="start-button" className="mx-auto min-w-0" disabled={!person} onClick={timer.toggle} aria-keyshortcuts="Space">
          <TimerIcon name={running ? 'pause' : 'play'} className="size-5 shrink-0" /> <span className="truncate">{running ? 'Pause' : turnStarted ? 'Reprendre' : 'Démarrer'}</span>
        </Button>
        <div className="flex min-w-0 items-center justify-end gap-1">
          {person && <Button onClick={() => setReadingNote(true)} aria-label={`Lire la note de ${person.name}`} title="Pense-bête" sx={{ minHeight: 44, minWidth: 44, px: 1, fontSize: 10, textTransform: 'none' }}><TimerIcon name="edit" className="size-3.5" /><span className="ml-1 max-[650px]:hidden">Pense-bête</span></Button>}
          <IconButton sx={{ width: 44, height: 44 }} id="manage-timer-button" type="button" aria-label={timer.focusMode ? 'Modifier les réglages' : 'Réglages'} title={timer.focusMode ? 'Modifier les réglages' : 'Réglages'} onClick={timer.manage}><SettingsRounded fontSize="small" /></IconButton>
        </div>
      </div>
      <div id="timer-feedback" className={`sr-only ${feedbackColor}`}>
        {ended && <span id="time-up-alert" role="alert">{person?.name}, Temps utilisé. Merci de passer la parole.</span>}
        <FeedbackIcon id="feedback-icon" className={`size-4 shrink-0 ${complete ? 'text-success' : ended ? 'text-danger' : nearly ? 'text-amber-700' : 'text-brand'}`} fontSize="inherit" aria-hidden="true" />
        <span id="feedback-text">{feedback}</span>
      </div>
      <div className={`${timer.focusMode ? 'hidden' : 'flex'} min-h-11 min-w-0 items-center justify-between gap-2 border-t border-line text-[11px] text-muted [@media(max-height:650px)]:hidden`}><span className="flex min-w-0 items-center gap-1.5"><TimerIcon name="timer" className="size-3.5 shrink-0" />{`${Math.floor(timer.duration / 60)} min ${timer.duration % 60 ? `${timer.duration % 60} s` : ''} par personne`}</span>{!timer.focusMode && <IconButton size="small" sx={{ width: 44, height: 44 }} type="button" id="reset-button" aria-label="Réinitialiser le minuteur de la personne qui parle" title="Réinitialiser le minuteur (R)" onClick={timer.reset} aria-keyshortcuts="R"><TimerIcon name="reset" /></IconButton>}</div>
      <Dialog open={readingNote} onClose={() => setReadingNote(false)} aria-labelledby="speaker-note-title" maxWidth="sm" fullWidth slotProps={{ paper: { sx: { maxHeight: 'calc(100dvh - 24px)', border: '1px solid #dce3e9', borderRadius: '14px' } } }}>
        <DialogTitle id="speaker-note-title" className="border-t-2 border-t-accent pb-2! text-lg! font-bold!">Le pense-bête de {person?.name ?? 'ce participant'}</DialogTitle>
        <DialogContent dividers>
          <p className="mb-3 text-[11px] text-muted">Note partagée avec l’équipe · aujourd’hui, heure de Maurice. Le minuteur garde son état : ouvrir cette note ne le suspend pas.</p>
          {notes.loading ? <div className="grid min-h-32 place-items-center"><Loader label="Chargement de la note…" /></div> : notes.error ? <div role="alert"><p>{notes.error}</p><Button onClick={notes.retry}>Réessayer</Button></div> : <ParticipantNote hint={note?.hint ?? 'Aucun pense-bête préparé pour aujourd’hui.'} />}
        </DialogContent>
        <DialogActions className="border-t border-line"><Button onClick={() => setReadingNote(false)} sx={{ minHeight: 44 }}>Fermer</Button></DialogActions>
      </Dialog>
    </Paper>
  );
}