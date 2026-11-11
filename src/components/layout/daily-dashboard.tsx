'use client';

import { useState } from 'react';
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded';
import { dailyRoundStatistics, type HistoryRound } from '@/lib/history/history';
import { formatTime } from '@/lib/timer/timer';
import { ScoreBreakdown } from '@/components/ui/score-breakdown';
import { PaginatedList } from '@/components/ui/paginated-list';
import { ScreenTabs } from '@/components/ui/screen-tabs';
import { segmentedTabs } from '@/components/ui/styles';
import { motion, useReducedMotion } from 'framer-motion';
import { DailyMoodPanel } from './daily-mood-panel';
import { StatisticsIcon } from '@/components/ui/statistics-icon';
import { useViewMotion } from '@/hooks/motion/use-view-motion';

const colors = { short: 'text-amber-800 bg-amber-50', optimal: 'text-success bg-success-soft', closing: 'text-orange-800 bg-orange-50', overtime: 'text-danger bg-danger-soft', unmeasured: 'text-muted bg-slate-100' };

export function DailyDashboard({ round }: { round: HistoryRound }) {
  const [view, setView] = useState<'scores' | 'moods'>('scores');
  const reduced = useReducedMotion();
  const panels = useViewMotion(view);
  const stats = dailyRoundStatistics(round);
  const leaders = stats.ranked.filter(person => person.rank === 1);
  const zones = [
    { key: 'short' as const, label: 'Avant 50 %', count: stats.short },
    { key: 'optimal' as const, label: '50 à 85 %', count: stats.optimal },
    { key: 'closing' as const, label: 'Derniers 15 %', count: stats.closing },
    { key: 'overtime' as const, label: 'Dépassement', count: stats.overtime },
    { key: 'unmeasured' as const, label: 'Non mesuré', count: stats.unmeasured },
  ];
  return <div ref={panels} id="daily-dashboard" className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden max-[650px]:gap-2 [@media(max-height:650px)]:gap-1">
    <dl className="grid shrink-0 grid-cols-4 gap-2 max-[650px]:gap-1.5" aria-label="Indicateurs du bilan du jour">
      {[
        { label: 'Score moyen', value: stats.averageScore === null ? '—' : String(stats.averageScore), detail: '/ 1 000', icon: 'chart' as const, surface: 'bg-blue-50/70' },
        { label: 'Parole', value: formatTime(stats.seconds), detail: 'temps cumulé · hors pauses', icon: 'clock' as const, surface: 'bg-white' },
        { label: 'À temps', value: stats.measured ? `${Math.round(stats.withinTime / stats.measured * 100)} %` : '—', detail: `${stats.withinTime}/${stats.measured}`, icon: 'check' as const, surface: 'bg-teal-50/60' },
        { label: 'Dépassement', value: formatTime(stats.overtimeSeconds), detail: `${stats.overtime} passage(s)`, icon: 'clock' as const, surface: 'bg-orange-50/70' },
      ].map(item => <div key={item.label} className={`min-w-0 border-t-2 border-line px-4 py-3 first:border-brand last:border-accent max-[650px]:px-2 max-[650px]:py-2 [@media(max-height:650px)]:py-1 ${item.surface}`}><dt className="flex items-center justify-between gap-1 text-xs leading-4 text-muted max-[650px]:text-[10px]" title={item.label}><span className="truncate">{item.label}</span><StatisticsIcon name={item.icon} className="hidden size-4 shrink-0 text-brand/60 sm:block" /></dt><dd className="my-1 text-3xl leading-none font-bold whitespace-nowrap tabular-nums text-ink max-[650px]:text-lg [@media(max-height:650px)]:my-0 [@media(max-height:650px)]:text-xl">{item.value}</dd><dd className="truncate text-xs leading-4 text-muted max-[650px]:text-[10px] [@media(max-height:650px)]:hidden">{item.detail}</dd></div>)}
    </dl>
      <ScreenTabs className={`${segmentedTabs} shrink-0 max-[1023px]:flex min-[1024px]:hidden`} label="Sections du bilan du jour" value={view} onChange={setView} tabs={[{ value: 'scores', label: 'Classement' }, { value: 'moods', label: 'Humeurs' }]} />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 min-[1024px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className={`flex min-h-0 min-w-0 flex-col overflow-hidden border-t-2 border-brand bg-white px-3 py-3 max-[650px]:px-1 max-[650px]:py-2 ${view !== 'scores' ? 'max-[1023px]:hidden' : ''}`} data-dashboard-column="scores" aria-labelledby="daily-ranking-heading">
          <header className="flex shrink-0 items-center justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase text-muted [@media(max-height:650px)]:hidden">Les prises de parole</p><h2 id="daily-ranking-heading" className="text-base font-bold text-ink">Classement du jour</h2></div><span className="shrink-0 text-[11px] font-semibold text-brand">/ 1 000 pts</span></header>
          <div className="mt-3 flex shrink-0 items-center gap-3 border-l-4 border-accent bg-orange-50 px-3 py-2 [@media(max-height:650px)]:hidden"><EmojiEventsRounded className="text-amber-800" /><div className="min-w-0 flex-1"><p className="text-[10px] font-semibold text-amber-800">{leaders.length > 1 ? `${leaders.length} premiers ex æquo` : leaders.length ? 'Meilleur score' : 'Aucun passage mesuré'}</p><p className="truncate text-sm font-bold text-ink" title={leaders.length === 1 ? leaders[0].name : undefined}>{leaders.length === 1 ? leaders[0].name : leaders.length ? 'Première place partagée' : 'Le temps de chacun compte'}</p></div>{leaders.length > 0 && <strong className="text-lg tabular-nums text-brand">{leaders[0].score}<span className="ml-1 text-[10px] font-normal">pts</span></strong>}</div>
          <dl className="mt-2 flex shrink-0 items-center justify-between gap-1 [@media(max-height:650px)]:mt-1" aria-label="Équilibre des prises de parole">{zones.map(zone => <div key={zone.key} className={`flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 ${colors[zone.key]}`}><dt className="truncate text-[10px] leading-4" title={zone.label}>{zone.label}</dt><dd className="text-[11px] leading-4 font-bold tabular-nums">{zone.count}</dd></div>)}</dl>
          <PaginatedList items={stats.ranked} className="daily-score-list py-0" ordered renderItem={person => {
            const measured = person.speakingSeconds >= 1 && person.budgetSeconds > 0;
            const ratio = measured ? person.speakingSeconds / person.budgetSeconds : 0;
            const zone = !measured ? 'unmeasured' : ratio < .5 ? 'short' : ratio <= .85 ? 'optimal' : ratio <= 1 ? 'closing' : 'overtime';
            return <li key={person.id} className="flex h-20 shrink-0 items-center gap-3 rounded-xl border-b border-slate-100 px-1 motion-safe:animate-enter max-[650px]:gap-2" data-daily-person={person.id}>
              <span className={`grid size-8 shrink-0 place-items-center rounded-xl text-xs font-bold tabular-nums ${person.rank === 1 ? 'bg-orange-50 text-amber-900' : 'bg-slate-50 text-muted'}`} aria-label={person.rank === null ? 'Sans rang' : `Rang ${person.rank}`}>{person.rank ?? '—'}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold text-ink" title={person.name}>{person.name}</p><p className="mt-0.5 truncate text-[11px] text-muted">{formatTime(person.speakingSeconds)} / {formatTime(person.budgetSeconds)}</p><span className={`inline-block rounded px-1 text-[10px] leading-4 ${colors[zone]}`}>{zones.find(item => item.key === zone)!.label}</span>
                <svg viewBox="0 0 100 3" preserveAspectRatio="none" className="mt-1 h-1 w-full" role="img" aria-label={`Score de ${person.name} : ${person.score ?? 'non noté'} sur 1 000`}><rect width="100" height="3" rx="1.5" className="fill-slate-100" /><motion.rect initial={reduced ? false : { width: 0 }} animate={{ width: (person.score ?? 0) / 10 }} transition={{ duration: reduced ? 0 : .4 }} height="3" rx="1.5" className={zone === 'optimal' ? 'fill-success' : zone === 'closing' ? 'fill-orange-500' : zone === 'overtime' ? 'fill-danger' : zone === 'short' ? 'fill-accent' : 'fill-slate-400'} /></svg>
              </div><div className="flex shrink-0 flex-col items-end"><strong className="text-sm tabular-nums text-brand">{person.score ?? '—'} pts</strong><ScoreBreakdown person={person} /></div>
            </li>;
          }} />
          <p className="shrink-0 text-[11px] leading-tight text-muted [@media(max-height:650px)]:hidden">Égalités partagées · Détail du score : calcul & pénalités. Ni qualité, ni humeur.</p>
        </section>
        <div className={`flex min-h-0 min-w-0 flex-col ${view !== 'moods' ? 'max-[1023px]:hidden' : ''}`}><DailyMoodPanel round={round} /></div>
      </div>
  </div>;
}