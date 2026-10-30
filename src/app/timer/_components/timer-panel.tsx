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
  const progressColor = ended || critical ? 'bg-danger' : nearly ? 'bg-accent' : 'bg-brand';
  const statusColor = ended || critical ? 'border-red-200 bg-danger-soft text-danger' : nearly ? 'border-orange-200 bg-orange-50 text-amber-800' : complete ? 'border-green-200 bg-success-soft text-success' : running || !turnStarted ? 'border-blue-200 bg-blue-50 text-brand' : 'border-orange-200 bg-orange-50 text-amber-800';
  const feedbackColor = complete ? 'text-success' : ended || critical ? 'font-semibold text-danger' : nearly ? 'text-amber-800' : 'text-muted';
  const panelColor = ended || critical ? 'border-red-200! bg-red-50/30' : nearly ? 'border-orange-200! bg-orange-50/30' : complete ? 'border-green-200! bg-success-soft' : running ? 'border-brand/40! bg-white' : 'border-slate-200/80';
  const pulse = running && critical ? 'motion-safe:animate-critical-glow' : running && nearly ? 'motion-safe:animate-warning-glow' : '';
  const FeedbackIcon = complete ? CheckIcon : ended ? ErrorOutlineIcon : nearly ? AccessTimeIcon : running ? RadioButtonCheckedIcon : NorthEastIcon;

  return (
    <Paper component="section" elevation={0} className={`timer-panel relative isolate grid min-h-0 min-w-0 grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-3 overflow-hidden rounded-lg border border-line bg-white p-5 text-center max-[650px]:gap-2 max-[650px]:p-3 [@media(max-height:650px)]:gap-1 [@media(max-height:650px)]:p-3 ${timer.focusMode ? '[@media(max-height:650px)]:grid-rows-[auto_auto_minmax(0,1fr)_auto]' : ''} ${panelColor} ${ended ? 'finished' : nearly ? 'warning' : ''} ${running ? 'running' : ''} ${complete ? 'session-complete' : ''} ${className}`} data-urgency={urgency} aria-labelledby="speaker-name">
      <div className="col-span-full flex min-w-0 items-center justify-between gap-2 self-start border-b border-line pb-2">
        <div className="flex min-w-0 items-center gap-2 max-[650px]:gap-1.5">
          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1.5 text-[11px] font-semibold tabular-nums text-muted max-[650px]:px-1.5">{person ? `Passage ${people.findIndex(candidate => candidate.id === person.id) + 1} / ${people.length}` : 'Terminé'}</span>
          <span className={`flex min-w-0 shrink items-center gap-1.5 rounded-full border px-2 py-1.5 text-[9px] font-semibold max-[650px]:gap-1 max-[650px]:px-1.5 max-[650px]:py-1 max-[650px]:text-[8px] ${statusColor}`} id="status-pill" data-status={status} role="status"><span className={`size-1.5 shrink-0 rounded-full bg-current ${running ? 'motion-safe:animate-pulse' : ''} motion-reduce:animate-none`} aria-hidden="true" />{status}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {person && <Button onClick={() => setReadingNote(true)} aria-label={`Lire la note de ${person.name}`} title="Pense-bête" sx={{ minHeight: 44, minWidth: 44, px: 1, fontSize: 10, textTransform: 'none' }}><TimerIcon name="edit" className="size-3.5" /><span className="ml-1 max-[650px]:hidden">Pense-bête</span></Button>}
          <Button disableElevation variant="outlined" sx={{ minHeight: 44, minWidth: 44, px: 1, fontSize: 10, textTransform: 'none' }} id="manage-timer-button" type="button" aria-label={timer.focusMode ? 'Modifier les réglages' : 'Réglages'} title={timer.focusMode ? 'Modifier les réglages' : 'Réglages'} onClick={timer.manage}><TimerIcon name="edit" /><span className="ml-1 max-[650px]:hidden">Réglages</span></Button>
        </div>
      </div>
      <div className="min-w-0 overflow-hidden">
        <SpeakerSlider timer={timer} />
        {ended ? <p id="time-up-alert" role="alert" className="text-[11px] font-semibold text-danger"><span className="sr-only">{person?.name}, </span>Temps utilisé. Merci de passer la parole.</p> : <span className="sr-only" id="speaker-mood-description" hidden={!person}>{person ? `Humeur ${person.mood} / 4 · ${running ? 'Parle maintenant' : 'À vous la parole'}` : ''}</span>}
      </div>
      <div id="timer-stage" key={`${timer.activeId}-${timer.focusMode}`} className={`row-start-3 grid min-h-0 min-w-0 grid-cols-1 content-center justify-items-center gap-3 self-stretch overflow-hidden rounded-lg bg-brand-dark px-4 py-5 text-white transition-colors motion-reduce:transition-none max-[650px]:gap-2 max-[650px]:py-3 [@media(max-height:650px)]:grid-cols-[minmax(0,1fr)_auto] [@media(max-height:650px)]:grid-rows-[auto_auto_auto] [@media(max-height:650px)]:gap-x-2 [@media(max-height:650px)]:gap-y-1 [@media(max-height:650px)]:px-2 [@media(max-height:650px)]:py-1 ${pulse}`}>
        <div className="min-w-0 max-[650px]:w-full [@media(max-height:650px)]:justify-self-start">
          <div id={timer.focusMode ? 'speaker-turn-cue' : undefined} role="status" aria-live="polite" aria-atomic="true" className="w-full min-w-0">
            <span className={`block text-[11px] font-bold uppercase [@media(max-height:650px)]:text-[9px] ${ended || critical ? 'text-red-200' : nearly ? 'text-orange-200' : 'text-blue-100'}`}>{timer.ended ? 'Merci de passer la parole' : timer.running ? 'À TOI DE PARLER !' : timer.turnStarted ? 'TON TOUR EST EN PAUSE' : 'La parole est à'}</span>
            <h2 id="speaker-name" className="mt-1 break-words text-2xl font-bold leading-tight text-white sm:text-3xl [@media(max-height:650px)]:text-sm" title={speakerName}>{speakerName}</h2>
          </div>
          {person?.mood && <div id="speaker-mood" role="group" aria-label={`Humeur de ${person.name} : ${person.mood} sur 4`} className="mt-2 flex items-center justify-center gap-2 text-xs font-semibold text-blue-100 [@media(max-height:650px)]:mt-1 [@media(max-height:650px)]:justify-start [@media(max-height:650px)]:text-[10px]">
            <span>Humeur <strong className="text-white">{person.mood}</strong> / 4</span>
            {person.moodSlide && <SpeakerMoodPicture key={`${person.id}:${person.moodSlide.image}:${person.mood}`} context={person.moodSlide} mood={person.mood} />}
          </div>}
        </div>
        <div className="flex min-w-0 flex-col items-center gap-2 [@media(max-height:650px)]:items-end [@media(max-height:650px)]:gap-0">
          <span className={`text-[11px] font-semibold uppercase [@media(max-height:650px)]:text-[8px] ${ended || critical ? 'text-red-200' : nearly ? 'text-orange-200' : 'text-blue-100'}`} id="timer-label">{ended ? 'Dépassement · passez la parole' : critical ? 'Concluez maintenant' : nearly ? 'Préparez la conclusion' : running ? 'Temps restant' : 'Temps par personne'}</span>
          <div id="timer-display" className={`text-7xl leading-none font-bold tabular-nums text-white sm:text-8xl min-[1360px]:text-9xl [@media(max-height:650px)]:text-5xl ${ended || critical ? 'text-red-200' : nearly ? 'text-orange-200' : ''}`} role="timer" aria-live="off" aria-label={`${ended ? 'Dépassement' : 'Temps restant'} : ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} et ${secs} ${secs === 1 ? 'seconde' : 'secondes'}`}>
            {ended ? '+' : ''}{String(minutes).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </div>
        </div>
        <div className="col-span-full w-full max-w-xl">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-label="Temps écoulé" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((1 - ratio) * 100)}>
            <span id="timer-progress" className={`block h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none ${progressColor}`} style={{ width: `${(1 - ratio) * 100}%` }} />
          </div>
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