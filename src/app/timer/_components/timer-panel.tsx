'use client';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineRounded';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import { useState } from 'react';
import { Loader } from '@infomil/scrum-shared/ui';
import type { useDailyHints } from '@/hooks/meeting/use-daily-hints';
import { primaryButton, secondaryButton } from '@/components/ui/styles';
import { ParticipantNote } from '@/components/ui/participant-note';
import { timerUrgency } from '@/lib/timer/timer';
import type { StandupTimer } from './timer-page';
import { SpeakerSlider } from './speaker-slider';
import { TimerIcon } from './timer-icon';
import { SpeakerMoodPicture } from './speaker-mood-picture';

const circumference = 2 * Math.PI * 136;

export function TimerPanel({ timer, notes, className = '' }: { timer: StandupTimer; notes: ReturnType<typeof useDailyHints>; className?: string }) {
  const { people, person, remaining, turnTotal, running, ended, warning, turnStarted } = timer;
  const [readingNote, setReadingNote] = useState(false);
  const note = notes.data?.hints.find(hint => hint.participantId === person?.id);

  const seconds = Math.ceil(Math.abs(remaining));
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const urgency = timerUrgency(remaining, warning, ended, turnStarted);
  const critical = urgency === 'critical';
  const nearly = urgency === 'warning' || critical;
  const complete = people.length > 0 && !person && people.every(person => person.done);
  const status = complete ? 'Tour terminé' : !person && people.some(p => p.postponed) ? 'Personnes en attente' : ended ? 'Temps écoulé' : running ? critical ? 'Concluez maintenant' : nearly ? 'Bientôt la fin' : 'À la parole' : turnStarted ? 'En pause' : 'Prêt à démarrer';
  const speakerName = person ? person.name : complete ? 'Le tour de table est terminé !' : 'En attente des personnes reportées';
  const feedback = complete ? 'Tout le monde a eu la parole. Bonne journée !' : ended ? 'Concluez puis Suivant : le prochain minuteur démarrera.' : critical ? 'Dernières secondes : terminez votre phrase.' : nearly ? 'Le temps diminue : préparez votre conclusion.' : running ? 'Suivant lance immédiatement le prochain passage.' : 'Cliquez sur Démarrer lorsque vous prenez la parole.';
  const ratio = turnTotal > 0 ? Math.min(1, Math.max(0, remaining / turnTotal)) : 0;
  const ringColor = ended || critical ? 'text-danger' : nearly ? 'text-amber-700' : 'text-brand';
  const statusColor = ended || critical ? 'border-red-200 bg-danger-soft text-danger' : nearly ? 'border-orange-200 bg-orange-50 text-amber-800' : complete ? 'border-green-200 bg-success-soft text-success' : running || !turnStarted ? 'border-blue-200 bg-blue-50 text-brand' : 'border-orange-200 bg-orange-50 text-amber-800';
  const feedbackColor = complete ? 'text-success' : ended || critical ? 'font-semibold text-danger' : nearly ? 'text-amber-800' : 'text-muted';
  const panelColor = ended || critical ? 'border-red-200! bg-red-50/30' : nearly ? 'border-orange-200! bg-orange-50/30' : complete ? 'border-green-200! bg-success-soft' : running ? 'border-brand/40! bg-white' : 'border-slate-200/80';
  const pulse = running && critical ? 'motion-safe:animate-critical-glow' : running && nearly ? 'motion-safe:animate-warning-glow' : '';
  const FeedbackIcon = complete ? CheckIcon : ended ? ErrorOutlineIcon : nearly ? AccessTimeIcon : running ? RadioButtonCheckedIcon : NorthEastIcon;

  return (
    <Paper component="section" elevation={0} className={`timer-panel relative isolate grid min-h-0 min-w-0 grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-2 overflow-hidden rounded-lg border border-line bg-white p-5 text-center max-[650px]:gap-1 max-[650px]:p-3 [@media(max-height:650px)]:gap-1 [@media(max-height:650px)]:p-3 ${timer.focusMode ? '[@media(max-height:650px)]:grid-rows-[auto_auto_minmax(0,1fr)_auto]' : ''} ${panelColor} ${ended ? 'finished' : nearly ? 'warning' : ''} ${running ? 'running' : ''} ${complete ? 'session-complete' : ''} ${className}`} data-urgency={urgency} aria-labelledby="speaker-name">
      <div className="col-span-full flex min-w-0 items-center justify-between gap-2 self-start">
        <span className="text-left text-xs font-semibold tabular-nums text-muted">{person ? `Passage ${people.findIndex(candidate => candidate.id === person.id) + 1} / ${people.length}` : 'Terminé'}</span>
        {person && <Button onClick={() => setReadingNote(true)} aria-label={`Lire la note de ${person.name}`} title="Pense-bête" sx={{ minHeight: 44, minWidth: 44, px: 1, fontSize: 10 }}><TimerIcon name="edit" className="size-3.5" /><span className="ml-1 max-[650px]:hidden">Pense-bête</span></Button>}
        <span className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1.5 text-[9px] font-semibold max-[650px]:px-1.5 max-[650px]:py-1 max-[650px]:text-[8px] ${statusColor}`} id="status-pill" data-status={status} role="status"><span className={`size-1.5 shrink-0 rounded-full bg-current ${running ? 'motion-safe:animate-pulse' : ''} motion-reduce:animate-none`} aria-hidden="true" />{status}</span>
        <IconButton size="small" sx={{ width: 44, height: 44 }} id="manage-timer-button" type="button" aria-label={timer.focusMode ? 'Modifier les réglages' : 'Réglages'} title={timer.focusMode ? 'Modifier les réglages' : 'Réglages'} onClick={timer.manage}><TimerIcon name="edit" /></IconButton>
      </div>
      <div className="min-w-0 overflow-hidden">
        <SpeakerSlider timer={timer} />
        {ended ? <p id="time-up-alert" role="alert" className="text-[11px] font-semibold text-danger"><span className="sr-only">{person?.name}, </span>Temps utilisé. Merci de passer la parole.</p> : <span className="sr-only" id="speaker-mood" hidden={!person}>{person ? `Humeur ${person.mood} / 4 · ${running ? 'Parle maintenant' : 'À vous la parole'}` : ''}</span>}
      </div>
      <div className="row-start-3 grid h-full min-h-0 min-w-0 place-items-center [container-type:size]">
        {/* Size against both dimensions of the remaining grid cell, not the viewport. */}
        <div key={`${timer.activeId}-${timer.focusMode}`} className={`timer-ring relative isolate aspect-square w-[min(100cqw,100cqh,380px)] rounded-full bg-slate-50/70 [container-type:inline-size] transition-colors motion-reduce:transition-none ${ringColor} ${pulse}`} id="timer-ring">
          {timer.focusMode && <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-accent opacity-0 motion-safe:animate-turn-halo" aria-hidden="true" />}
          <div className="absolute inset-[6%] rounded-full bg-neutral-900" aria-hidden="true" />
          {person?.moodSlide && person.mood && <SpeakerMoodPicture key={`${person.moodSlide.image}:${person.mood}`} context={person.moodSlide} mood={person.mood} />}
          <svg className="relative size-full -rotate-90 overflow-visible" viewBox="0 0 300 300" aria-hidden="true">
            <circle className="fill-none stroke-current stroke-[4] opacity-10" cx="150" cy="150" r="136" />
            <circle className="fill-none stroke-current stroke-[5] [stroke-linecap:round] transition-[stroke-dashoffset,stroke] duration-150 ease-linear motion-reduce:transition-none" id="ring-progress" cx="150" cy="150" r="136" style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - ratio) }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center p-[12%]">
            <div className="flex w-full min-w-0 flex-col items-center gap-1 px-[3%] py-[5%] text-white">
            <div id={timer.focusMode ? 'speaker-turn-cue' : undefined} role="status" aria-live="polite" aria-atomic="true" className="w-full min-w-0">
              <span className="block text-[clamp(7px,3cqw,11px)] font-semibold text-white">{timer.ended ? 'Merci de passer la parole' : timer.running ? 'À TOI DE PARLER !' : timer.turnStarted ? 'TON TOUR EST EN PAUSE' : 'La parole est à'}</span>
              <h2 id="speaker-name" className="line-clamp-2 text-[clamp(12px,7cqw,27px)] font-bold leading-tight [overflow-wrap:anywhere]" title={speakerName}>{speakerName}</h2>
            </div>
            <span className="text-[clamp(5px,3cqw,8px)] font-bold leading-relaxed text-white" id="timer-label">{ended ? 'DÉPASSEMENT · PASSEZ LA PAROLE' : critical ? 'CONCLUEZ MAINTENANT' : nearly ? 'PRÉPAREZ LA CONCLUSION' : running ? 'TEMPS RESTANT' : 'TEMPS PAR PERSONNE'}</span>
            <div id="timer-display" className="text-[clamp(24px,23cqw,88px)] leading-none font-semibold tabular-nums text-white" role="timer" aria-live="off" aria-label={`${ended ? 'Dépassement' : 'Temps restant'} : ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} et ${secs} ${secs === 1 ? 'seconde' : 'secondes'}`}>
              {ended ? '+' : ''}{String(minutes).padStart(2, '0')}<span>:</span>{String(secs).padStart(2, '0')}
            </div>
            {person && <span className="text-[clamp(7px,3cqw,10px)] font-medium text-white">Humeur {person.mood} / 4</span>}
            </div>
          </div>
          <span className="absolute top-[3%] left-1/2 size-[3%] -translate-x-1/2 rounded-full bg-current" aria-hidden="true" />
        </div>
      </div>
      <div className="col-span-full mx-auto flex w-full max-w-lg min-w-0 items-center justify-center gap-2 max-[650px]:gap-1">
        <Button size="small" variant="outlined" sx={{ minHeight: 44, minWidth: 44, px: 1, textTransform: 'none', fontSize: 11 }} type="button" id="previous-button" disabled={!timer.canPrevious} onClick={timer.previous} aria-label="Précédent" title="Revenir à l’intervenant précédent"><TimerIcon name="back" className="size-3.5 shrink-0" /><span className="ml-1 max-[650px]:hidden">Précédent</span></Button>
        {person && <IconButton size="small" sx={{ width: 44, height: 44 }} type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-white text-muted hover:bg-amber-50 hover:text-amber-800" aria-label={`Reporter le passage de ${person.name}`} title="Reporter ce passage" onClick={() => timer.postpone(person.id)}><TimerIcon name="later" /></IconButton>}
        <Button disableElevation size="small" variant={running ? 'outlined' : 'contained'} sx={{ minHeight: 44, minWidth: 0, px: 1, textTransform: 'none', fontSize: 11 }} type="button" id="start-button" className={`${running ? secondaryButton : primaryButton} min-h-11 min-w-0 flex-1 rounded-xl max-[650px]:px-2 max-[650px]:text-[11px]`} disabled={!person} onClick={timer.toggle} aria-keyshortcuts="Space">
          <TimerIcon name={running ? 'pause' : 'play'} className="size-3.5 shrink-0" /> {running ? 'Pause' : turnStarted ? 'Reprendre' : 'Démarrer'}
        </Button>
        <Button disableElevation size="small" variant={ended ? 'contained' : 'outlined'} sx={{ minHeight: 44, minWidth: 0, px: 1, textTransform: 'none', fontSize: 11 }} type="button" id="next-button" className={`${ended ? primaryButton : secondaryButton} min-h-11 rounded-xl max-[650px]:px-2 max-[650px]:text-[11px]`} disabled={!person} onClick={timer.next} aria-keyshortcuts="N">Suivant <TimerIcon name="next" className="size-3.5 shrink-0" /></Button>
      </div>
      <div id="timer-feedback" className={`sr-only ${feedbackColor}`}>
        <FeedbackIcon id="feedback-icon" className={`size-4 shrink-0 ${complete ? 'text-success' : ended ? 'text-danger' : nearly ? 'text-amber-700' : 'text-brand'}`} fontSize="inherit" aria-hidden="true" />
        <span id="feedback-text">{feedback}</span>
      </div>
      <div className={`flex min-h-11 min-w-0 items-center justify-between gap-2 border-t border-line text-[11px] text-muted ${timer.focusMode ? '[@media(max-height:650px)]:hidden' : ''}`}><span className="flex min-w-0 items-center gap-1.5"><TimerIcon name={timer.focusMode ? 'lock' : 'timer'} className="size-3.5 shrink-0" />{timer.focusMode ? 'Réglages verrouillés' : `${Math.floor(timer.duration / 60)} min ${timer.duration % 60 ? `${timer.duration % 60} s` : ''} par personne`}</span>{!timer.focusMode && <IconButton size="small" sx={{ width: 44, height: 44 }} type="button" id="reset-button" aria-label="Réinitialiser le minuteur de la personne qui parle" title="Réinitialiser le minuteur (R)" onClick={timer.reset} aria-keyshortcuts="R"><TimerIcon name="reset" /></IconButton>}</div>
      <Dialog open={readingNote} onClose={() => setReadingNote(false)} aria-labelledby="speaker-note-title" maxWidth="sm" fullWidth>
        <DialogTitle id="speaker-note-title">Le pense-bête de {person?.name ?? 'ce participant'}</DialogTitle>
        <DialogContent dividers>
          <p className="mb-3 text-[11px] text-muted">Note partagée avec l’équipe · aujourd’hui, heure de Maurice. Le minuteur garde son état : ouvrir cette note ne le suspend pas.</p>
          {notes.loading ? <div className="grid min-h-32 place-items-center"><Loader label="Chargement de la note…" /></div> : notes.error ? <div role="alert"><p>{notes.error}</p><Button onClick={notes.retry}>Réessayer</Button></div> : <ParticipantNote hint={note?.hint ?? 'Aucun pense-bête préparé pour aujourd’hui.'} />}
        </DialogContent>
        <DialogActions><Button onClick={() => setReadingNote(false)}>Fermer</Button></DialogActions>
      </Dialog>
    </Paper>
  );
}