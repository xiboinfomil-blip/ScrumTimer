'use client';

import { useState } from 'react';
import { Button, Paper } from '@mui/material';
import { WorkflowHeading } from '@/components/ui/workflow-heading';
import { ScreenTabs } from '@/components/ui/screen-tabs';
import { PaginatedList } from '@/components/ui/paginated-list';
import { card, primaryButton, routeStage, segmentedTabs } from '@/components/ui/styles';
import { formatTime } from '@/lib/timer';
import { sessionLeaderboard, sessionStatistics } from '@/lib/session-results';
import type { StandupTimer } from './timer-page';
import { MoodSlideSummary } from './mood-slide-summary';
import { ScoreBreakdown } from '@/components/ui/score-breakdown';
import { useViewMotion } from '@/hooks/use-view-motion';

export function SessionResults({ timer }: { timer: StandupTimer }) {
  const [view, setView] = useState<'ranking' | 'stats'>('ranking');
  const panels = useViewMotion(view);
  const ranked = sessionLeaderboard(timer.people);
  const stats = sessionStatistics(timer.people);
  const winners = ranked.filter(person => person.rank === 1);
  const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date());
  return <div id="timer-page" data-mode="results" className={`${routeStage} mx-auto w-full overflow-hidden`}>
    <WorkflowHeading step={3} title="Bilan du tour" description={`${date} · ${timer.people.length} participants`} action={<Button disableElevation size="small" variant="contained" sx={{ minHeight: 44, minWidth: 0, textTransform: 'none', fontSize: 12 }} id="new-round-button" type="button" className={primaryButton} onClick={timer.newRound}>Nouveau tour</Button>} />
    <ScreenTabs className={segmentedTabs} label="Bilan du point quotidien" value={view} onChange={setView} tabs={[{ value: 'ranking', label: 'Classement' }, { value: 'stats', label: 'Statistiques' }]} />
    <div ref={panels} className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.3fr)_minmax(280px,1fr)] gap-3 max-[800px]:grid-cols-1">
      <Paper component="section" elevation={0} sx={{ borderRadius: 3 }} id="session-leaderboard" aria-labelledby="leaderboard-title" className={`${card} flex min-h-0 min-w-0 flex-col gap-2 p-3 ${view !== 'ranking' ? 'max-[800px]:hidden' : ''}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-line pb-2"><h2 id="leaderboard-title" className="text-sm font-semibold">Classement · Maîtrise du temps</h2><span className="text-[10px] text-muted">/ 1 000 pts</span></div>
        <div className="shrink-0 rounded-lg border border-orange-200 bg-linear-to-r from-orange-50 to-white px-3 py-2 motion-safe:animate-enter">
          <span className="text-[10px] font-semibold text-amber-800">🏆 {winners.length > 1 ? `${winners.length} premiers ex æquo` : winners.length ? 'Meilleur score' : 'Aucun passage mesurable'}</span>
          <p className="truncate text-lg font-bold text-ink" title={winners.map(person => person.name).join(', ')}>{winners.length === 1 ? winners[0].name : winners.length ? 'Victoire partagée !' : 'Le prochain tour vous attend'}</p>
          {winners.length > 0 && <p className="text-xs font-semibold text-brand">{winners[0].score} points</p>}
        </div>
        <PaginatedList items={ranked} className="leaderboard-list" ordered renderItem={person => <li key={person.id} className={`flex h-20 shrink-0 items-center gap-2 rounded-lg border-b px-2 ${person.rank === 1 ? 'border-orange-100 bg-orange-50/50' : 'border-line'}`}>
          <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${person.rank === 1 ? 'bg-accent/15 text-amber-800' : 'bg-slate-100 text-muted'}`}>{person.rank ?? '—'}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={person.name}>{person.name}</p><p className="text-[10px] text-muted">{person.score === null ? 'Passage non mesuré' : `${formatTime(person.speakingSeconds)} · ${person.attempts} passage(s) · ${person.timeUp ? 'Signal atteint' : 'Avant le signal'}`}</p></div>
          <div className="flex shrink-0 flex-col items-end"><strong className={`text-sm tabular-nums ${person.score === null ? 'text-muted' : 'text-brand'}`}>{person.score ?? '—'}<span className="ml-1 text-[9px] font-normal">pts</span></strong><ScoreBreakdown person={person} /></div>
        </li>} />
        <p className="shrink-0 border-t border-line pt-2 text-[10px] leading-snug text-muted">Même calcul pour le score en direct, le bilan et le total archivé. Référence fixe en secondes, indépendante du budget configuré, même différent de 120 s. Jusqu’à 5 s incluses : 0 ; après 5 s : max(125, (t − 5) × 10), sommet 1 000 à 105 s. Puis −5 pts/s jusqu’à 110 s (975), −10 pts/s jusqu’à 115 s (925), −15 pts/s jusqu’à 120 s (850). Après 120 s : −50 par tranche complète de 10 s, plancher 125 dès 270 s. Relance après réinitialisation : −100 (max. 200), sans descendre sous 125 après 5 s ; grâce à 0 conservée. Ensuite, pénalité manuelle : −50 par clic, cumulée et déduite après ce plancher, avec un total minimum de 0. Pauses exclues et sans pénalité ; moins de 1 s non mesuré. Archives antérieures inchangées. Gestion du temps uniquement, ni qualité ni humeur.</p>
      </Paper>
      <Paper component="section" elevation={0} sx={{ borderRadius: 3 }} id="session-statistics" aria-labelledby="statistics-title" className={`${card} flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto p-3 ${view !== 'stats' ? 'max-[800px]:hidden' : ''}`}>
        <h2 id="statistics-title" className="shrink-0 border-b border-line pb-2 text-sm font-semibold">Le bilan d’aujourd’hui</h2>
        <dl className="grid shrink-0 grid-cols-2 gap-2">
          {[['Temps de parole', formatTime(stats.speakingSeconds)], ['Moyenne / personne', formatTime(stats.averageSeconds)], ['Dans le temps', `${stats.withinTime} / ${stats.measured}`], ['Dépassements', String(stats.expired)]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 px-3 py-2"><dt className="text-[10px] text-muted">{label}</dt><dd className="mt-0.5 text-xl font-semibold tabular-nums text-brand">{value}</dd></div>)}
        </dl>
        <div className="shrink-0 border-t border-line pt-2"><h3 className="text-xs font-semibold">Les humeurs de l’équipe</h3><p className="mt-1 text-[10px] text-muted">Repères du baromètre choisi, pas des notes.</p>
          <div className="mt-3 space-y-3">{stats.moods.map(({ mood, count }) => <div key={mood} className="grid grid-cols-[60px_minmax(0,1fr)_45px] items-center gap-2 text-[11px]"><span>Humeur {mood}</span><div className="flex h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Humeur ${mood} : ${count} personnes`}><div className="h-full rounded-full bg-brand/70" style={{ width: `${timer.people.length ? count / timer.people.length * 100 : 0}%` }} /></div><span className="text-right tabular-nums text-muted">{count} · {Math.round(count / timer.people.length * 100)}%</span></div>)}</div>
        </div>
        <MoodSlideSummary people={timer.people} />
        <p className="mt-auto shrink-0 border-t border-line pt-2 text-[10px] leading-snug text-muted">Tour terminé envoyé à Neon pour les statistiques des 5 derniers jours. Vérifiez la confirmation « Neon enregistré » avant de quitter ; en cas d’échec, réessayez. Aucune copie locale. Pauses exclues ; le dépassement après le signal est mesuré.</p>
      </Paper>
    </div>
  </div>;
}