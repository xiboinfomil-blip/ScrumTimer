'use client';

import { useState } from 'react';
import { WorkflowHeading } from '@/components/ui/workflow-heading';
import { ScreenTabs } from '@/components/ui/screen-tabs';
import { PaginatedList } from '@/components/ui/paginated-list';
import { card, primaryButton, routeStage, segmentedTabs } from '@/components/ui/styles';
import { formatTime } from '@/lib/timer';
import { sessionLeaderboard, sessionStatistics } from '@/lib/session-results';
import type { StandupTimer } from './timer-page';
import { MoodSlideSummary } from './mood-slide-summary';

export function SessionResults({ timer }: { timer: StandupTimer }) {
  const [view, setView] = useState<'ranking' | 'stats'>('ranking');
  const ranked = sessionLeaderboard(timer.people);
  const stats = sessionStatistics(timer.people);
  const winners = ranked.filter(person => person.rank === 1);
  const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date());
  return <div id="timer-page" data-mode="results" className={`${routeStage} mx-auto w-full max-w-6xl overflow-hidden`}>
    <WorkflowHeading step={3} title="Bilan du tour" description={`${date} · ${timer.people.length} participants`} action={<button id="new-round-button" type="button" className={primaryButton} onClick={timer.newRound}>Nouveau tour</button>} />
    <ScreenTabs className={segmentedTabs} label="Bilan du point quotidien" value={view} onChange={setView} tabs={[{ value: 'ranking', label: 'Classement' }, { value: 'stats', label: 'Statistiques' }]} />
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.3fr)_minmax(280px,1fr)] gap-3 max-[800px]:grid-cols-1">
      <section id="session-leaderboard" aria-labelledby="leaderboard-title" className={`${card} flex min-h-0 min-w-0 flex-col gap-2 p-3 [&>.list-pagination]:h-11 [&>.list-pagination>button]:size-11 ${view !== 'ranking' ? 'max-[800px]:hidden' : ''}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-line pb-2"><h2 id="leaderboard-title" className="text-sm font-semibold">Classement · Maîtrise du temps</h2><span className="text-[10px] text-muted">/ 1 000 pts</span></div>
        <div className="shrink-0 rounded-lg border border-orange-200 bg-linear-to-r from-orange-50 to-white px-3 py-2 motion-safe:animate-enter">
          <span className="text-[10px] font-semibold text-amber-800">🏆 {winners.length > 1 ? `${winners.length} premiers ex æquo` : winners.length ? 'Meilleur score' : 'Aucun passage mesurable'}</span>
          <p className="truncate text-lg font-bold text-ink" title={winners.map(person => person.name).join(', ')}>{winners.length === 1 ? winners[0].name : winners.length ? 'Victoire partagée !' : 'Le prochain tour vous attend'}</p>
          {winners.length > 0 && <p className="text-xs font-semibold text-brand">{winners[0].score} points</p>}
        </div>
        <PaginatedList items={ranked} className="leaderboard-list" ordered renderItem={person => <li key={person.id} className={`flex h-14 shrink-0 items-center gap-3 rounded-lg border-b px-2 ${person.rank === 1 ? 'border-orange-100 bg-orange-50/50' : 'border-line'}`}>
          <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${person.rank === 1 ? 'bg-accent/15 text-amber-800' : 'bg-slate-100 text-muted'}`}>{person.rank ?? '—'}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={person.name}>{person.name}</p><p className="text-[10px] text-muted">{person.score === null ? 'Passage non mesuré' : `${formatTime(person.speakingSeconds)} · ${person.attempts} passage(s) · ${person.timeUp ? 'Signal atteint' : 'Avant le signal'}`}</p></div>
          <strong className={`shrink-0 text-sm tabular-nums ${person.score === null ? 'text-muted' : 'text-brand'}`}>{person.score ?? '—'}<span className="ml-1 text-[9px] font-normal">pts</span></strong>
        </li>} />
        <p className="shrink-0 border-t border-line pt-2 text-[10px] leading-snug text-muted">400 pts + 300 avant le signal + 300 pour 25–85 % du temps.<span className="max-[650px]:hidden"> Bonus progressif en dehors de cette zone. −100 par reprise (max. 200), dépassement jusqu’à −300. Pause ≠ reprise.</span> Humeur non notée.</p>
      </section>
      <section id="session-statistics" aria-labelledby="statistics-title" className={`${card} flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto p-3 ${view !== 'stats' ? 'max-[800px]:hidden' : ''}`}>
        <h2 id="statistics-title" className="shrink-0 border-b border-line pb-2 text-sm font-semibold">Le bilan d’aujourd’hui</h2>
        <dl className="grid shrink-0 grid-cols-2 gap-2">
          {[['Temps de parole', formatTime(stats.speakingSeconds)], ['Moyenne / personne', formatTime(stats.averageSeconds)], ['Avant le signal', `${stats.withinTime} / ${stats.measured}`], ['Temps utilisé à 100 %', String(stats.expired)]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 px-3 py-2"><dt className="text-[10px] text-muted">{label}</dt><dd className="mt-0.5 text-xl font-semibold tabular-nums text-brand">{value}</dd></div>)}
        </dl>
        <div className="shrink-0 border-t border-line pt-2"><h3 className="text-xs font-semibold">Les humeurs de l’équipe</h3><p className="mt-1 text-[10px] text-muted">Repères du baromètre choisi, pas des notes.</p>
          <div className="mt-3 space-y-3">{stats.moods.map(({ mood, count }) => <div key={mood} className="grid grid-cols-[60px_minmax(0,1fr)_45px] items-center gap-2 text-[11px]"><span>Humeur {mood}</span><div className="flex h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Humeur ${mood} : ${count} personnes`}><div className="h-full rounded-full bg-brand/70" style={{ width: `${timer.people.length ? count / timer.people.length * 100 : 0}%` }} /></div><span className="text-right tabular-nums text-muted">{count} · {Math.round(count / timer.people.length * 100)}%</span></div>)}</div>
        </div>
        <MoodSlideSummary people={timer.people} />
        <p className="mt-auto shrink-0 border-t border-line pt-2 text-[10px] leading-snug text-muted">Tour terminé envoyé à Neon pour les statistiques des 5 derniers jours. Vérifiez la confirmation « Neon ✓ » avant de quitter ; en cas d’échec, réessayez. Aucune copie locale. Pauses exclues ; le temps après le signal n’est pas mesuré.</p>
      </section>
    </div>
  </div>;
}