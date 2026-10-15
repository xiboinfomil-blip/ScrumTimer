'use client';

import { Button, IconButton, Paper } from '@mui/material';
import { card, primaryButton, secondaryButton } from '@/components/ui/styles';
import { timerUrgency } from '@/lib/timer';
import { speakerScoreProgress } from '@/lib/session-results';
import type { StandupTimer } from './timer-page';
import { TimerSettings } from './timer-settings';
import { SpeakerSlider } from './speaker-slider';
import { TimerIcon } from './timer-icon';

const circumference = 2 * Math.PI * 136;

export function TimerPanel({ timer, className = '' }: { timer: StandupTimer; className?: string }) {
  const { people, person, remaining, turnTotal, running, ended, warning, turnStarted } = timer;

  const scoreProgress = person ? speakerScoreProgress(person) : { score: null, zone: 'waiting' as const };
  const scoreColor = scoreProgress.zone === 'building' ? 'text-amber-700' : scoreProgress.zone === 'optimal' ? 'text-success' : scoreProgress.zone === 'overtime' ? 'text-danger' : 'text-brand';
  const scoreLabel = scoreProgress.zone === 'building' ? '↗ Score en hausse · avant ¼' : scoreProgress.zone === 'optimal' ? '✓ Zone optimale · ¼ à 100 %' : scoreProgress.zone === 'overtime' ? scoreProgress.score === 0 ? '− Score minimum atteint' : '↘ Dépassement · points en baisse' : '¼ à 100 % = meilleur score';
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
  const ringColor = ended ? 'text-danger' : scoreColor;
  const statusColor = ended || critical ? 'border-red-200 bg-danger-soft text-danger' : nearly ? 'border-orange-200 bg-orange-50 text-amber-800' : complete ? 'border-green-200 bg-success-soft text-success' : running || !turnStarted ? 'border-blue-200 bg-blue-50 text-brand' : 'border-orange-200 bg-orange-50 text-amber-800';
  const feedbackColor = complete ? 'text-success' : ended || critical ? 'font-semibold text-danger' : nearly ? 'text-amber-800' : 'text-muted';
  const panelColor = ended || critical ? 'border-red-200! bg-red-50/30' : nearly ? 'border-orange-200! bg-orange-50/30' : complete ? 'border-green-200! bg-success-soft' : running ? 'border-brand/40! bg-white' : 'border-slate-200/80';
  const pulse = running && critical ? 'motion-safe:animate-critical-glow' : running && nearly ? 'motion-safe:animate-warning-glow' : '';

  return (
    <Paper component="section" elevation={0} className={`timer-panel ${card} relative isolate grid min-h-0 min-w-0 grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2 overflow-hidden rounded-2xl p-3 text-center max-[650px]:gap-1 ${panelColor} ${ended ? 'finished' : nearly ? 'warning' : ''} ${running ? 'running' : ''} ${complete ? 'session-complete' : ''} ${className}`} data-urgency={urgency} aria-labelledby="speaker-name">
      <div className="col-span-full flex min-w-0 items-center justify-between gap-2 self-start">
        <span className="rounded-lg bg-slate-100/80 px-2 py-1.5 text-left text-[10px] font-semibold tabular-nums text-muted">{person ? `Passage ${people.findIndex(candidate => candidate.id === person.id) + 1} / ${people.length}` : 'Terminé'}</span>
        <span className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1.5 text-[9px] font-semibold max-[650px]:px-1.5 max-[650px]:py-1 max-[650px]:text-[8px] ${statusColor}`} id="status-pill" data-status={status} role="status"><span className={`size-1.5 shrink-0 rounded-full bg-current ${running ? 'motion-safe:animate-pulse' : ''} motion-reduce:animate-none`} aria-hidden="true" />{status}</span>
      </div>
      <div className="min-w-0 overflow-hidden">
        {timer.focusMode ? <SpeakerSlider timer={timer} /> : <h2 key={timer.activeId} id="speaker-name" className="truncate text-2xl font-semibold leading-tight tracking-tight motion-safe:animate-enter max-[650px]:text-lg" title={speakerName} aria-live="polite" aria-atomic="true">{speakerName}</h2>}
        {ended ? <p id="time-up-alert" role="alert" className="text-[11px] font-semibold text-danger"><span className="sr-only">{person?.name}, </span>Temps utilisé. Merci de passer la parole.</p> : <span className="text-[11px] text-muted [@media(max-height:650px)]:hidden" id="speaker-mood" hidden={!person}>{person ? `Humeur ${person.mood} / 4 · ${running ? 'Parle maintenant' : 'À vous la parole'}` : ''}</span>}
      </div>
      <div className="row-start-3 grid h-full min-h-0 min-w-0 place-items-center [container-type:size]">
        {/* Size against both dimensions of the remaining grid cell, not the viewport. */}
        <div key={`${timer.activeId}-${timer.focusMode}`} className={`timer-ring relative isolate aspect-square ${timer.focusMode ? 'w-[min(100cqw,100cqh,320px)] max-[650px]:w-[min(100cqw,100cqh,260px)]' : 'w-[min(100cqw,100cqh,260px)] max-[650px]:w-[min(100cqw,100cqh,220px)]'} rounded-full [container-type:inline-size] transition-colors motion-reduce:transition-none ${ringColor} ${pulse}`} id="timer-ring">
          {timer.focusMode && <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-accent opacity-0 motion-safe:animate-turn-halo" aria-hidden="true" />}
          <svg className="size-full -rotate-90 overflow-visible" viewBox="0 0 300 300" aria-hidden="true">
            <circle className="fill-none stroke-current stroke-[6] opacity-15" cx="150" cy="150" r="136" />
            <circle className="fill-none stroke-current stroke-[6] [stroke-linecap:round] transition-[stroke-dashoffset,stroke] duration-150 ease-linear motion-reduce:transition-none" id="ring-progress" cx="150" cy="150" r="136" style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - ratio) }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-[10%]">
            <span className="text-[clamp(5px,3cqw,8px)] font-bold leading-relaxed tracking-wide text-muted" id="timer-label">{ended ? 'DÉPASSEMENT · PASSEZ LA PAROLE' : critical ? 'CONCLUEZ MAINTENANT' : nearly ? 'PRÉPAREZ LA CONCLUSION' : running ? 'TEMPS RESTANT' : 'TEMPS PAR PERSONNE'}</span>
            <div id="timer-display" className={`text-[clamp(24px,22cqw,70px)] leading-none font-semibold tracking-[-2px] tabular-nums ${ended || critical ? 'text-danger' : 'text-ink'}`} role="timer" aria-live="off" aria-label={`${ended ? 'Dépassement' : 'Temps restant'} : ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} et ${secs} ${secs === 1 ? 'seconde' : 'secondes'}`}>
              {ended ? '+' : ''}{String(minutes).padStart(2, '0')}<span className={ringColor}>:</span>{String(secs).padStart(2, '0')}
            </div>
            <div id="live-score" data-score-zone={scoreProgress.zone} className={`flex max-w-full flex-col items-center leading-tight ${scoreColor}`} aria-label="Score de gestion du temps en direct" title="Avant 25 % : score progressif. De 25 à 100 % : 1 000 pts. Ensuite −100 pts par 10 % de dépassement. Relance après réinitialisation : −100 (max. 200). Pause sans pénalité. Ne mesure pas la qualité de la contribution.">
              <strong id="live-score-value" className="text-[clamp(10px,7cqw,20px)] tabular-nums" aria-live="off">{scoreProgress.score ?? '—'}<span className="text-[clamp(7px,4cqw,11px)] font-normal"> / 1 000 pts</span></strong>
              <span className="text-[clamp(6px,3.5cqw,10px)]" role="status">{scoreLabel}</span>
            </div>
          </div>
          <span className="absolute top-[3%] left-1/2 size-[3%] -translate-x-1/2 rounded-full bg-current" aria-hidden="true" />
        </div>
      </div>
      <div className="col-span-full flex min-w-0 items-center justify-center gap-2 max-[650px]:gap-1.5">
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
    </Paper>
  );
}