'use client';

import { useState } from 'react';
import { dailyRoundStatistics, type HistoryRound } from '@/lib/history';
import { formatTime } from '@/lib/timer';
import { ScoreBreakdown } from '@/components/ui/score-breakdown';
import { PaginatedList } from '@/components/ui/paginated-list';
import { ScreenTabs } from '@/components/ui/screen-tabs';
import { segmentedTabs } from '@/components/ui/styles';
import { motion, useReducedMotion } from 'framer-motion';
import { DailyMoodPanel } from './daily-mood-panel';

const colors = { short: 'text-amber-800 bg-amber-50', optimal: 'text-success bg-success-soft', overtime: 'text-danger bg-danger-soft', unmeasured: 'text-muted bg-slate-100' };

export function DailyDashboard({ round, expanded }: { round: HistoryRound; expanded: boolean }) {
  const [view, setView] = useState<'scores' | 'moods'>('scores');
  const reduced = useReducedMotion();
  const stats = dailyRoundStatistics(round);
  const zones = [
    { key: 'short' as const, label: 'Avant ¼', count: stats.short },
    { key: 'optimal' as const, label: '¼ à 100 %', count: stats.optimal },
    { key: 'overtime' as const, label: 'Dépassement', count: stats.overtime },
    { key: 'unmeasured' as const, label: 'Non mesuré', count: stats.unmeasured },
  ];
  return <div id="daily-dashboard" className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
    <dl className="grid shrink-0 grid-cols-4 gap-1 border-y border-line py-1" aria-label="Indicateurs du bilan du jour">
      {[
        { label: 'Score moyen', value: stats.averageScore === null ? '—' : String(stats.averageScore), detail: '/ 1 000' },
        { label: 'Parole', value: formatTime(stats.seconds), detail: 'hors pauses' },
        { label: 'À temps', value: stats.measured ? `${Math.round(stats.withinTime / stats.measured * 100)} %` : '—', detail: `${stats.withinTime}/${stats.measured}` },
        { label: 'Dépassement', value: formatTime(stats.overtimeSeconds), detail: `${stats.overtime} passage(s)` },
      ].map(item => <div key={item.label} className="min-w-0 px-1"><dt className="truncate text-[9px] text-muted" title={item.label}>{item.label}</dt><dd className="text-base font-bold tabular-nums text-brand sm:text-xl">{item.value}</dd><dd className="truncate text-[9px] text-muted [@media(max-height:650px)]:hidden">{item.detail}</dd></div>)}
    </dl>
    {expanded && <>
      <ScreenTabs className={`${segmentedTabs} shrink-0 min-[1024px]:hidden`} label="Sections du bilan du jour" value={view} onChange={setView} tabs={[{ value: 'scores', label: 'Points & détails' }, { value: 'moods', label: 'Mood meters' }]} />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 min-[1024px]:grid-cols-2">
        <section className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${view !== 'scores' ? 'max-[1023px]:hidden' : ''}`} data-dashboard-column="scores" aria-labelledby="daily-ranking-heading">
          <header className="flex shrink-0 items-center justify-between gap-1"><h2 id="daily-ranking-heading" className="text-xs font-bold text-brand">Bilan enregistré · Classement</h2><span className="text-[9px] text-muted">/ 1 000 pts</span></header>
          <dl className="mt-1 grid shrink-0 grid-cols-4 gap-1" aria-label="Équilibre des prises de parole">{zones.map(zone => <div key={zone.key} className={`rounded-md px-1 py-1 text-center ${colors[zone.key]}`}><dt className="truncate text-[8px]" title={zone.label}>{zone.label}</dt><dd className="text-xs font-bold">{zone.count}</dd></div>)}</dl>
          <PaginatedList items={stats.ranked} className="daily-score-list" ordered renderItem={person => {
            const measured = person.speakingSeconds >= 1 && person.budgetSeconds > 0;
            const ratio = measured ? person.speakingSeconds / person.budgetSeconds : 0;
            const zone = !measured ? 'unmeasured' : ratio < .25 ? 'short' : ratio <= 1 ? 'optimal' : 'overtime';
            return <li key={person.id} className="flex h-20 shrink-0 items-center gap-2 border-b border-line px-1" data-daily-person={person.id}>
              <span className="w-5 shrink-0 text-center text-xs font-bold text-brand" aria-label={person.rank === null ? 'Sans rang' : `Rang ${person.rank}`}>{person.rank === 1 ? '🏆' : person.rank ?? '—'}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold" title={person.name}>{person.name}</p><p className="mt-0.5 truncate text-[9px] text-muted">{formatTime(person.speakingSeconds)} / {formatTime(person.budgetSeconds)}</p><span className={`inline-block rounded px-1 text-[9px] ${colors[zone]}`}>{zones.find(item => item.key === zone)!.label}</span>
                <svg viewBox="0 0 100 3" preserveAspectRatio="none" className="mt-1 h-1 w-full" role="img" aria-label={`Score de ${person.name} : ${person.score ?? 'non noté'} sur 1 000`}><rect width="100" height="3" rx="1.5" className="fill-slate-100" /><motion.rect initial={reduced ? false : { width: 0 }} animate={{ width: (person.score ?? 0) / 10 }} transition={{ duration: reduced ? 0 : .4 }} height="3" rx="1.5" className={zone === 'optimal' ? 'fill-success' : zone === 'overtime' ? 'fill-danger' : zone === 'short' ? 'fill-accent' : 'fill-slate-400'} /></svg>
              </div><div className="flex shrink-0 flex-col items-end"><strong className="text-xs tabular-nums text-brand">{person.score ?? '—'} pts</strong><ScoreBreakdown person={person} /></div>
            </li>;
          }} />
          <p className="shrink-0 text-[9px] leading-tight text-muted">Égalités partagées · Détail du score : calcul & pénalités. Ni qualité, ni humeur.</p>
        </section>
        <div className={`flex min-h-0 min-w-0 flex-col ${view !== 'moods' ? 'max-[1023px]:hidden' : ''}`}><DailyMoodPanel round={round} /></div>
      </div>
    </>}
  </div>;
}