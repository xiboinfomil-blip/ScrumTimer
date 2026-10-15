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
import { StatisticsIcon } from '@/app/statistics/_components/statistics-icon';

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
    <dl className="grid shrink-0 grid-cols-4 gap-1.5" aria-label="Indicateurs du bilan du jour">
      {[
        { label: 'Score moyen', value: stats.averageScore === null ? '—' : String(stats.averageScore), detail: '/ 1 000', icon: 'chart' as const, surface: 'bg-blue-50/70' },
        { label: 'Parole', value: formatTime(stats.seconds), detail: 'hors pauses', icon: 'clock' as const, surface: 'bg-slate-50' },
        { label: 'À temps', value: stats.measured ? `${Math.round(stats.withinTime / stats.measured * 100)} %` : '—', detail: `${stats.withinTime}/${stats.measured}`, icon: 'check' as const, surface: 'bg-teal-50/60' },
        { label: 'Dépassement', value: formatTime(stats.overtimeSeconds), detail: `${stats.overtime} passage(s)`, icon: 'clock' as const, surface: 'bg-orange-50/70' },
      ].map(item => <div key={item.label} className={`min-w-0 rounded-xl px-2 py-1.5 [@media(max-height:650px)]:py-1 ${item.surface}`}><dt className="flex items-center justify-between gap-1 text-[10px] leading-4 text-muted" title={item.label}><span className="truncate">{item.label}</span><StatisticsIcon name={item.icon} className="hidden size-3.5 shrink-0 text-brand/60 sm:block" /></dt><dd className="text-lg leading-6 font-bold tracking-tight whitespace-nowrap tabular-nums text-brand sm:text-xl">{item.value}</dd><dd className="truncate text-[10px] leading-3 text-muted [@media(max-height:650px)]:hidden">{item.detail}</dd></div>)}
    </dl>
    {expanded && <>
      <ScreenTabs className={`${segmentedTabs} shrink-0 max-[1023px]:flex min-[1024px]:hidden`} label="Sections du bilan du jour" value={view} onChange={setView} tabs={[{ value: 'scores', label: 'Points & détails' }, { value: 'moods', label: 'Mood meters' }]} />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 min-[1024px]:grid-cols-2">
        <section className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 px-2 py-2 [@media(max-height:650px)]:py-1 ${view !== 'scores' ? 'max-[1023px]:hidden' : ''}`} data-dashboard-column="scores" aria-labelledby="daily-ranking-heading">
          <header className="flex shrink-0 items-center justify-between gap-1"><h2 id="daily-ranking-heading" className="text-xs font-bold text-brand">Bilan enregistré · Classement</h2><span className="shrink-0 text-[10px] text-muted">/ 1 000 pts</span></header>
          <dl className="mt-1 flex shrink-0 items-center justify-between gap-1" aria-label="Équilibre des prises de parole">{zones.map(zone => <div key={zone.key} className={`flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 ${colors[zone.key]}`}><dt className="truncate text-[10px] leading-4" title={zone.label}>{zone.label}</dt><dd className="text-[11px] leading-4 font-bold tabular-nums">{zone.count}</dd></div>)}</dl>
          <PaginatedList items={stats.ranked} className="daily-score-list" ordered renderItem={person => {
            const measured = person.speakingSeconds >= 1 && person.budgetSeconds > 0;
            const ratio = measured ? person.speakingSeconds / person.budgetSeconds : 0;
            const zone = !measured ? 'unmeasured' : ratio < .25 ? 'short' : ratio <= 1 ? 'optimal' : 'overtime';
            return <li key={person.id} className="flex h-20 shrink-0 items-center gap-2 rounded-xl border-b border-slate-100 px-1" data-daily-person={person.id}>
              <span className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold tabular-nums ${person.rank === 1 ? 'bg-orange-100 text-amber-900 ring-1 ring-orange-200' : 'bg-slate-100 text-brand'}`} aria-label={person.rank === null ? 'Sans rang' : `Rang ${person.rank}`}>{person.rank ?? '—'}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold text-ink" title={person.name}>{person.name}</p><p className="mt-0.5 truncate text-[11px] text-muted">{formatTime(person.speakingSeconds)} / {formatTime(person.budgetSeconds)}</p><span className={`inline-block rounded px-1 text-[10px] leading-4 ${colors[zone]}`}>{zones.find(item => item.key === zone)!.label}</span>
                <svg viewBox="0 0 100 3" preserveAspectRatio="none" className="mt-1 h-1 w-full" role="img" aria-label={`Score de ${person.name} : ${person.score ?? 'non noté'} sur 1 000`}><rect width="100" height="3" rx="1.5" className="fill-slate-100" /><motion.rect initial={reduced ? false : { width: 0 }} animate={{ width: (person.score ?? 0) / 10 }} transition={{ duration: reduced ? 0 : .4 }} height="3" rx="1.5" className={zone === 'optimal' ? 'fill-success' : zone === 'overtime' ? 'fill-danger' : zone === 'short' ? 'fill-accent' : 'fill-slate-400'} /></svg>
              </div><div className="flex shrink-0 flex-col items-end"><strong className="text-sm tabular-nums text-brand">{person.score ?? '—'} pts</strong><ScoreBreakdown person={person} /></div>
            </li>;
          }} />
          <p className="shrink-0 text-[11px] leading-tight text-muted [@media(max-height:650px)]:hidden">Égalités partagées · Détail du score : calcul & pénalités. Ni qualité, ni humeur.</p>
        </section>
        <div className={`flex min-h-0 min-w-0 flex-col ${view !== 'moods' ? 'max-[1023px]:hidden' : ''}`}><DailyMoodPanel round={round} /></div>
      </div>
    </>}
  </div>;
}