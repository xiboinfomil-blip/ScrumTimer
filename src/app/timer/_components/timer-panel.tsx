'use client';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper } from '@mui/material';
import { useEffect, useState } from 'react';
import { useDailyHints } from '@/hooks/use-daily-hints';
import { useTeam } from '@/providers/team-provider';
import { primaryButton, secondaryButton } from '@/components/ui/styles';
import { timerUrgency } from '@/lib/timer';
import type { StandupTimer } from './timer-page';
import { TimerSettings } from './timer-settings';
import { SpeakerSlider } from './speaker-slider';
import { TimerIcon } from './timer-icon';

const circumference = 2 * Math.PI * 136;

export function TimerPanel({ timer, className = '' }: { timer: StandupTimer; className?: string }) {
  const { people, person, remaining, turnTotal, running, ended, warning, turnStarted } = timer;
  const { activeTeamId } = useTeam();
  const notes = useDailyHints(activeTeamId);
  const [readingNote, setReadingNote] = useState(false);
  const note = notes.data?.hints.find(hint => hint.participantId === person?.id);
  const refreshNotes = notes.retry;
  useEffect(() => { refreshNotes(); }, [person?.id, refreshNotes]);

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

  return (
    <Paper component="section" elevation={0} className={`timer-panel relative isolate grid min-h-0 min-w-0 grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2 overflow-hidden rounded-2xl border border-line bg-white p-4 text-center shadow-sm shadow-brand/3 max-[650px]:gap-1 max-[650px]:p-2.5 [@media(max-height:650px)]:p-2.5 ${panelColor} ${ended ? 'finished' : nearly ? 'warning' : ''} ${running ? 'running' : ''} ${complete ? 'session-complete' : ''} ${className}`} data-urgency={urgency} aria-labelledby="speaker-name">
      <div className="col-span-full flex min-w-0 items-center justify-between gap-2 self-start">
        <span className="text-left text-xs font-semibold tabular-nums text-muted">{person ? `Passage ${people.findIndex(candidate => candidate.id === person.id) + 1} / ${people.length}` : 'Terminé'}</span>
        {person && <Button onClick={() => setReadingNote(true)} aria-label={`Lire la note de ${person.name}`} sx={{ minHeight: 44, minWidth: 0, px: 1, fontSize: 10 }}><span aria-hidden="true" className="mr-1">✎</span>Pense-bête</Button>}
        <span className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1.5 text-[9px] font-semibold max-[650px]:px-1.5 max-[650px]:py-1 max-[650px]:text-[8px] ${statusColor}`} id="status-pill" data-status={status} role="status"><span className={`size-1.5 shrink-0 rounded-full bg-current ${running ? 'motion-safe:animate-pulse' : ''} motion-reduce:animate-none`} aria-hidden="true" />{status}</span>
      </div>
      <div className="min-w-0 overflow-hidden">
        {timer.focusMode ? <SpeakerSlider timer={timer} /> : <h2 key={timer.activeId} id="speaker-name" className="truncate text-3xl font-bold leading-tight tracking-tight motion-safe:animate-enter max-[650px]:text-xl" title={speakerName} aria-live="polite" aria-atomic="true">{speakerName}</h2>}
        {ended ? <p id="time-up-alert" role="alert" className="text-[11px] font-semibold text-danger"><span className="sr-only">{person?.name}, </span>Temps utilisé. Merci de passer la parole.</p> : <span className="text-[11px] text-muted [@media(max-height:650px)]:hidden" id="speaker-mood" hidden={!person}>{person ? `Humeur ${person.mood} / 4 · ${running ? 'Parle maintenant' : 'À vous la parole'}` : ''}</span>}
        {note && <p data-speaker-hint className="mx-auto mt-1 max-w-lg line-clamp-2 whitespace-pre-wrap break-words rounded-lg border-l-2 border-accent bg-orange-50/70 px-2 py-1 text-left text-[11px] leading-4 text-ink">{note.hint}</p>}
      </div>
      <div className="row-start-3 grid h-full min-h-0 min-w-0 place-items-center [container-type:size]">
        {/* Size against both dimensions of the remaining grid cell, not the viewport. */}
        <div key={`${timer.activeId}-${timer.focusMode}`} className={`timer-ring relative isolate aspect-square ${timer.focusMode ? 'w-[min(100cqw,100cqh,320px)] max-[650px]:w-[min(100cqw,100cqh,260px)]' : 'w-[min(100cqw,100cqh,260px)] max-[650px]:w-[min(100cqw,100cqh,220px)]'} rounded-full [container-type:inline-size] transition-colors motion-reduce:transition-none ${ringColor} ${pulse}`} id="timer-ring">
          {timer.focusMode && <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-accent opacity-0 motion-safe:animate-turn-halo" aria-hidden="true" />}
          <svg className="size-full -rotate-90 overflow-visible" viewBox="0 0 300 300" aria-hidden="true">
            <circle className="fill-none stroke-current stroke-[4] opacity-10" cx="150" cy="150" r="136" />
            <circle className="fill-none stroke-current stroke-[5] [stroke-linecap:round] transition-[stroke-dashoffset,stroke] duration-150 ease-linear motion-reduce:transition-none" id="ring-progress" cx="150" cy="150" r="136" style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - ratio) }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-[10%]">
            <span className="text-[clamp(5px,3cqw,8px)] font-bold leading-relaxed tracking-wide text-muted" id="timer-label">{ended ? 'DÉPASSEMENT · PASSEZ LA PAROLE' : critical ? 'CONCLUEZ MAINTENANT' : nearly ? 'PRÉPAREZ LA CONCLUSION' : running ? 'TEMPS RESTANT' : 'TEMPS PAR PERSONNE'}</span>
            <div id="timer-display" className={`text-[clamp(24px,23cqw,74px)] leading-none font-semibold tracking-[-2px] tabular-nums ${ended || critical ? 'text-danger' : 'text-ink'}`} role="timer" aria-live="off" aria-label={`${ended ? 'Dépassement' : 'Temps restant'} : ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} et ${secs} ${secs === 1 ? 'seconde' : 'secondes'}`}>
              {ended ? '+' : ''}{String(minutes).padStart(2, '0')}<span className={ringColor}>:</span>{String(secs).padStart(2, '0')}
            </div>
          </div>
          <span className="absolute top-[3%] left-1/2 size-[3%] -translate-x-1/2 rounded-full bg-current" aria-hidden="true" />
        </div>
      </div>
      <div className="col-span-full mx-auto flex w-full max-w-lg min-w-0 items-center justify-center gap-2 max-[650px]:gap-1.5">
        {person && <IconButton size="small" sx={{ width: 44, height: 44 }} type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-white text-muted hover:bg-amber-50 hover:text-amber-800" aria-label={`Reporter le passage de ${person.name}`} title="Reporter ce passage" onClick={() => timer.postpone(person.id)}><TimerIcon name="later" /></IconButton>}
        {!timer.focusMode && <IconButton size="small" sx={{ width: 44, height: 44 }} type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-white text-muted hover:bg-blue-50 hover:text-brand" id="reset-button" aria-label="Réinitialiser le minuteur de la personne qui parle" title="Réinitialiser le minuteur (R)" onClick={timer.reset} aria-keyshortcuts="R"><TimerIcon name="reset" /></IconButton>}
        <Button disableElevation size="small" variant={running ? 'outlined' : 'contained'} sx={{ minHeight: 44, minWidth: 0, px: 1, textTransform: 'none', fontSize: 11 }} type="button" id="start-button" className={`${running ? secondaryButton : primaryButton} min-h-11 min-w-0 flex-1 rounded-xl max-[650px]:px-2 max-[650px]:text-[11px]`} disabled={!person} onClick={timer.toggle} aria-keyshortcuts="Space">
          <TimerIcon name={running ? 'pause' : 'play'} className="size-3.5 shrink-0" /> {running ? 'Pause' : turnStarted ? 'Reprendre' : 'Démarrer'}
        </Button>
        <Button disableElevation size="small" variant={ended ? 'contained' : 'outlined'} sx={{ minHeight: 44, minWidth: 0, px: 1, textTransform: 'none', fontSize: 11 }} type="button" id="next-button" className={`${ended ? primaryButton : secondaryButton} min-h-11 rounded-xl max-[650px]:px-2 max-[650px]:text-[11px]`} disabled={!person} onClick={timer.next} aria-keyshortcuts="N">Suivant <TimerIcon name="next" className="size-3.5 shrink-0" /></Button>
      </div>
      <div id="timer-feedback" className={`col-span-full flex min-h-5 items-center justify-center gap-1.5 text-[10px] leading-snug [@media(max-height:650px)]:hidden ${feedbackColor}`}>
        <span id="feedback-icon" className={`shrink-0 ${complete ? 'text-success' : ended ? 'text-danger' : nearly ? 'text-amber-700' : 'text-brand'}`} aria-hidden="true">{complete ? '✓' : ended ? '!' : nearly ? '◷' : running ? '◎' : '↗'}</span>
        <span id="feedback-text">{feedback}</span>
      </div>
      {timer.focusMode ? <div className="flex min-h-11 items-center justify-between gap-2 border-t border-line text-[11px] text-muted"><span className="flex items-center gap-1.5"><TimerIcon name="lock" className="size-3.5" />Réglages verrouillés</span><Button disableElevation size="small" variant="outlined" sx={{ minHeight: 44, minWidth: 0, textTransform: 'none', fontSize: 11 }} id="manage-timer-button" type="button" className={`${secondaryButton} min-h-11 rounded-xl`} onClick={timer.manage}><TimerIcon name="edit" />Modifier</Button></div> : <TimerSettings timer={timer} />}
      <Dialog open={readingNote} onClose={() => setReadingNote(false)} aria-labelledby="speaker-note-title" maxWidth="sm" fullWidth>
        <DialogTitle id="speaker-note-title">Le pense-bête de {person?.name ?? 'ce participant'}</DialogTitle>
        <DialogContent dividers>
          <p className="mb-3 text-[11px] text-muted">Note partagée avec l’équipe · aujourd’hui, heure de Maurice. Le minuteur garde son état : ouvrir cette note ne le suspend pas.</p>
          {notes.loading ? <p role="status">Chargement de la note…</p> : notes.error ? <div role="alert"><p>{notes.error}</p><Button onClick={notes.retry}>Réessayer</Button></div> : <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{note?.hint ?? 'Aucun pense-bête préparé pour aujourd’hui.'}</p>}
        </DialogContent>
        <DialogActions><Button onClick={() => setReadingNote(false)}>Fermer</Button></DialogActions>
      </Dialog>
    </Paper>
  );
}