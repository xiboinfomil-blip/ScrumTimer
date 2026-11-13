'use client';

import { useState } from 'react';
import { Trophy as EmojiEventsRounded } from 'lucide-react';
import { Medal as MilitaryTechRounded } from 'lucide-react';
import { Users as GroupsRounded } from 'lucide-react';
import { dailyRoundStatistics, type HistoryRound } from '@/lib/history/history';
import { formatTime } from '@/lib/timer/timer';
import { ScoreBreakdown } from '@/components/ui/score-breakdown';
import { PaginatedList } from '@/components/ui/paginated-list';
import { ScreenTabs } from '@/components/ui/screen-tabs';
import { segmentedTabs } from '@/components/ui/styles';
import { motion, useReducedMotion } from 'framer-motion';
import { StatisticsIcon } from '@/components/ui/statistics-icon';
import { useViewMotion } from '@/hooks/motion/use-view-motion';

const colors = { short: 'text-amber-800 bg-amber-50', optimal: 'text-success bg-success-soft', closing: 'text-orange-800 bg-orange-50', overtime: 'text-danger bg-danger-soft', unmeasured: 'text-muted bg-slate-100' };

const awards = {
  1: { label: 'Or', medal: 'border-[#bd923e] bg-[#fff4cf] text-[#906114]', step: 'h-28 border-[#bd923e] bg-linear-to-b from-[#fff0ba] to-[#e8bd62] text-[#684811] max-[650px]:h-20 [@media(max-height:650px)]:h-16', icon: 'size-12! max-[650px]:size-12! [@media(max-height:650px)]:size-10!', name: 'text-lg max-[650px]:text-sm' },
  2: { label: 'Argent', medal: 'border-[#a5b6c4] bg-[#f2f7fa] text-[#4c687e]', step: 'h-24 border-[#a5b6c4] bg-linear-to-b from-[#f2f7fa] to-[#c6d5e0] text-[#354f64] max-[650px]:h-14 [@media(max-height:650px)]:h-12', icon: 'size-12! max-[650px]:size-10! [@media(max-height:650px)]:size-8!', name: 'text-base max-[650px]:text-xs' },
  3: { label: 'Bronze', medal: 'border-[#c49d84] bg-[#fcf0e7] text-[#8e5838]', step: 'h-18 border-[#c49d84] bg-linear-to-b from-[#f8e9dc] to-[#d9ae8e] text-[#6d422b] max-[650px]:h-10 [@media(max-height:650px)]:h-9', icon: 'size-12! max-[650px]:size-10! [@media(max-height:650px)]:size-8!', name: 'text-base max-[650px]:text-xs' },
};

export function DailyDashboard({ round }: { round: HistoryRound }) {
  const [view, setView] = useState<'podium' | 'scores'>('podium');
  const reduced = useReducedMotion();
  const panels = useViewMotion(view);
  const stats = dailyRoundStatistics(round);
  const podium = ([2, 1, 3] as const).map(rank => ({ rank, people: stats.ranked.filter(person => person.rank === rank) })).filter(group => group.people.length > 0);
  const zones = [
    { key: 'short' as const, label: 'Avant 50 %', count: stats.short },
    { key: 'optimal' as const, label: '50 à 85 %', count: stats.optimal },
    { key: 'closing' as const, label: 'Derniers 15 %', count: stats.closing },
    { key: 'overtime' as const, label: 'Dépassement', count: stats.overtime },
    { key: 'unmeasured' as const, label: 'Non mesuré', count: stats.unmeasured },
  ];
  return <div ref={panels} id="daily-dashboard" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain max-[650px]:gap-2 [@media(max-height:650px)]:gap-2">
    <dl className="grid shrink-0 grid-cols-4 divide-x divide-brand/15 border-b border-brand/15 pb-3 max-[650px]:pb-2 [@media(max-height:650px)]:pb-1" aria-label="Indicateurs du bilan du jour">
      {[
        { label: 'Score moyen', value: stats.averageScore === null ? '—' : String(stats.averageScore), detail: '/ 1 000 points', icon: 'chart' as const },
        { label: 'Parole', value: formatTime(stats.seconds), detail: 'temps partagé', icon: 'clock' as const },
        { label: 'À temps', value: stats.measured ? `${Math.round(stats.withinTime / stats.measured * 100)} %` : '—', detail: `${stats.withinTime}/${stats.measured} passages`, icon: 'check' as const },
        { label: 'Dépassement', value: formatTime(stats.overtimeSeconds), detail: `${stats.overtime} passage(s)`, icon: 'clock' as const },
      ].map(item => <div key={item.label} className="min-w-0 px-4 first:pl-0 last:pr-0 max-[650px]:px-2"><dt className="flex items-center gap-1.5 text-xs leading-4 text-muted max-[650px]:text-[10px]" title={item.label}><StatisticsIcon name={item.icon} className="hidden size-3.5 shrink-0 text-brand sm:block" /><span className="break-words">{item.label}</span></dt><dd className="my-1 text-2xl leading-none font-bold whitespace-nowrap tabular-nums text-brand max-[650px]:text-lg [@media(max-height:650px)]:my-0.5 [@media(max-height:650px)]:text-lg">{item.value}</dd><dd className="truncate text-[11px] leading-4 text-muted max-[650px]:hidden [@media(max-height:650px)]:hidden">{item.detail}</dd></div>)}
    </dl>
    <ScreenTabs className={`${segmentedTabs} shrink-0 max-[1023px]:flex min-[1024px]:hidden`} label="Sections du bilan du jour" value={view} onChange={setView} tabs={[{ value: 'podium', label: 'Podium' }, { value: 'scores', label: 'Classement' }]} />
    <div className="grid min-h-60 flex-1 grid-cols-1 gap-5 min-[1024px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] max-[650px]:min-h-52 [@media(max-height:400px)]:min-h-56">
      <section data-dashboard-column="podium" aria-labelledby="daily-podium-heading" className={`flex min-h-0 min-w-0 flex-col items-center justify-center gap-5 px-4 py-3 max-[650px]:gap-2 max-[650px]:px-0 max-[650px]:py-0 [@media(max-height:650px)]:gap-2 [@media(max-height:650px)]:py-0 ${view !== 'podium' ? 'max-[1023px]:hidden' : ''}`}>
        <header className="text-center"><p className="mb-1 text-xs font-semibold text-[#906114] max-[650px]:hidden [@media(max-height:650px)]:hidden">Un beau moment d’équipe</p><h2 id="daily-podium-heading" className="text-2xl font-bold text-brand max-[650px]:text-lg [@media(max-height:650px)]:text-lg">Bravo, l’équipe.</h2></header>
        {podium.length > 0 ? <ol aria-label="Podium du jour" data-results-podium className={`grid w-full max-w-xl shrink-0 list-none items-end gap-3 border-b-2 border-brand/20 px-2 max-[650px]:gap-1.5 max-[650px]:px-0 ${podium.length === 3 ? 'grid-cols-3' : podium.length === 2 ? 'grid-cols-2' : 'max-w-64 grid-cols-1'}`}>
          {podium.map(({ rank, people }) => <motion.li key={rank} data-podium-rank={rank} initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .5, delay: reduced ? 0 : rank === 1 ? .18 : .08 }} className="flex min-w-0 flex-col items-center text-center">
            <span aria-hidden="true" className={`mb-3 grid size-16 place-items-center rounded-full border shadow-sm max-[650px]:mb-2 max-[650px]:size-14 [@media(max-height:650px)]:mb-1 [@media(max-height:650px)]:size-12 ${awards[rank].medal}`}>{rank === 1 ? <EmojiEventsRounded className={awards[rank].icon} /> : <MilitaryTechRounded className={awards[rank].icon} />}</span>
            <p title={people.map(person => person.name).join(', ')} className={`line-clamp-2 min-h-10 max-w-full font-bold leading-5 text-ink [overflow-wrap:anywhere] ${awards[rank].name}`}>{people.slice(0, 2).map(person => person.name).join(' · ')}{people.length > 2 ? ` · +${people.length - 2}` : ''}</p>
            <span className="min-h-4 text-[10px] font-semibold text-[#173c51]">{people.length > 1 ? `${people.length} ex æquo` : awards[rank].label}</span>
            <p className="mb-3 mt-1 text-2xl font-extrabold tabular-nums text-[#173c51] max-[650px]:mb-2 max-[650px]:text-lg [@media(max-height:650px)]:mb-1 [@media(max-height:650px)]:text-lg">{people[0].score}<span className="ml-1 text-[10px] font-medium">pts</span></p>
            <div aria-label={`Rang ${rank}`} className={`relative flex w-full flex-col items-center justify-center overflow-hidden rounded-t-md border-t-2 border-x text-4xl font-extrabold tabular-nums shadow-[inset_0_1px_0_#ffffffb3] max-[650px]:text-2xl ${awards[rank].step}`}><span aria-hidden="true" className="absolute inset-y-0 left-2 w-px bg-white/40" /><span>{rank}</span><span className="mt-1 text-[9px] font-semibold uppercase max-[650px]:hidden [@media(max-height:650px)]:hidden">{awards[rank].label}</span></div>
          </motion.li>)}
        </ol> : <div className="grid min-h-36 place-content-center justify-items-center gap-3 text-muted"><GroupsRounded className="size-12!" /><p className="text-sm">Aucun passage mesuré</p></div>}
        <p className="flex items-center gap-2 text-xs font-medium text-[#173c51] [@media(max-height:650px)]:hidden"><GroupsRounded size={20} />Merci pour ces {round.people.length} passages partagés.</p>
      </section>
      <section className={`relative z-0 flex min-h-0 min-w-0 flex-col border-l border-brand/15 bg-white px-5 py-3 max-[1023px]:border-l-0 max-[650px]:px-2 max-[650px]:py-2 [@media(max-height:650px)]:py-2 ${view !== 'scores' ? 'max-[1023px]:hidden' : ''}`} data-dashboard-column="scores" aria-labelledby="daily-ranking-heading">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line pb-3 [@media(max-height:650px)]:pb-1"><div><h2 id="daily-ranking-heading" className="text-base font-bold text-brand">Classement du jour</h2><p className="mt-0.5 text-[11px] text-muted">{stats.ranked.length} participants · Égalités partagées</p></div><span className="shrink-0 text-[11px] font-semibold text-muted">/ 1 000 pts</span></header>
        <div className="flex min-h-40 flex-1 flex-col"><PaginatedList items={stats.ranked} className="daily-score-list py-0" ordered renderItem={person => {
            const measured = person.speakingSeconds >= 1 && person.budgetSeconds > 0;
            const ratio = measured ? person.speakingSeconds / person.budgetSeconds : 0;
            const zone = !measured ? 'unmeasured' : ratio < .5 ? 'short' : ratio <= .85 ? 'optimal' : ratio <= 1 ? 'closing' : 'overtime';
            return <li key={person.id} className="flex h-20 shrink-0 items-center gap-3 border-b border-brand/10 px-1 max-[650px]:gap-2" data-daily-person={person.id}>
              <span className={`grid size-9 shrink-0 place-items-center rounded-full border text-xs font-bold tabular-nums ${person.rank && person.rank <= 3 ? awards[person.rank as 1 | 2 | 3].medal : 'border-line bg-white text-muted'}`} aria-label={person.rank === null ? 'Sans rang' : `Rang ${person.rank}`}>{person.rank ?? '—'}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink" title={person.name}>{person.name}</p><p className="mt-0.5 truncate text-[11px] text-muted">{formatTime(person.speakingSeconds)} / {formatTime(person.budgetSeconds)}</p><span className={`inline-block rounded px-1 text-[10px] leading-4 ${colors[zone]}`}>{zones.find(item => item.key === zone)!.label}</span></div>
              <div className="flex shrink-0 flex-col items-end"><strong className="text-base tabular-nums text-brand">{person.score ?? '—'} <span className="text-[10px] font-medium text-muted">pts</span></strong><ScoreBreakdown person={person} compact /></div>
            </li>;
          }} /></div>
        <p className="mt-2 shrink-0 text-[10px] leading-tight text-muted [@media(max-height:650px)]:hidden">Le score porte sur le temps de parole, jamais sur sa qualité ou l’humeur.</p>
      </section>
    </div>
  </div>;
}