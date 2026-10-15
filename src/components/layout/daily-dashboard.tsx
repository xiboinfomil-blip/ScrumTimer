'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Paper } from '@mui/material';
import { dailyRoundStatistics, type HistoryRound } from '@/lib/history';
import { formatTime } from '@/lib/timer';
import { ScoreBreakdown } from '@/components/ui/score-breakdown';

const panel = 'min-w-0 rounded-2xl border border-line bg-white p-4';
const colors = { short: 'text-amber-800 bg-amber-50', optimal: 'text-success bg-success-soft', overtime: 'text-danger bg-danger-soft', unmeasured: 'text-muted bg-slate-100' };

export function DailyDashboard({ round, expanded }: { round: HistoryRound; expanded: boolean }) {
  const [page, setPage] = useState(0);
  const stats = dailyRoundStatistics(round);
  const pages = Math.max(1, Math.ceil(stats.ranked.length / 8));
  const current = Math.min(page, pages - 1);
  const withinPercent = stats.measured ? Math.round(stats.withinTime / stats.measured * 100) : null;
  const zones = [
    { key: 'short' as const, label: 'Avant ¼', count: stats.short },
    { key: 'optimal' as const, label: 'Zone optimale', count: stats.optimal },
    { key: 'overtime' as const, label: 'Dépassement', count: stats.overtime },
    { key: 'unmeasured' as const, label: 'Non mesuré', count: stats.unmeasured },
  ];
  return <div className="space-y-4" id="daily-dashboard">
    <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Indicateurs du bilan du jour">
      {[
        ['Score moyen', stats.averageScore === null ? '—' : `${stats.averageScore} / 1 000`, `${stats.scored} passage(s) noté(s) · sans bonus de participation`],
        ['Temps de parole', formatTime(stats.seconds), `${round.people.length} participant(s) · pauses exclues`],
        ['Dans le temps', withinPercent === null ? '—' : `${withinPercent} %`, `${stats.withinTime} / ${stats.measured} passages mesurés`],
        ['Dépassement cumulé', formatTime(stats.overtimeSeconds), `${stats.overtime} passage(s) au-delà du budget initial`],
      ].map(([label, value, detail]) => <Paper component="div" variant="outlined" key={label} className="min-w-0 rounded-xl p-3" sx={{ borderRadius: 3 }}><dt className="text-[11px] text-muted">{label}</dt><dd className="mt-1 whitespace-nowrap text-base font-bold tracking-tight tabular-nums text-brand min-[390px]:text-xl sm:text-2xl">{value}</dd><dd className="mt-1 text-[10px] leading-relaxed text-muted">{detail}</dd></Paper>)}
    </dl>
    {expanded && <>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className={panel} aria-labelledby="daily-ranking-heading">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="daily-ranking-heading" className="text-base font-bold text-brand">Bilan enregistré · Classement</h2><span className="text-[10px] text-muted">Score enregistré / 1 000</span></div>
          <p className="mt-1 text-xs text-muted">Égalités au même rang. Les passages non notés ne sont pas classés.</p>
          <ol className="mt-3 divide-y divide-line" start={current * 8 + 1} aria-label="Classement du jour">
            {stats.ranked.slice(current * 8, current * 8 + 8).map(person => {
              const measured = person.speakingSeconds >= 1 && person.budgetSeconds > 0;
              const ratio = measured ? person.speakingSeconds / person.budgetSeconds : 0;
              const zone = !measured ? 'unmeasured' : ratio < .25 ? 'short' : ratio <= 1 ? 'optimal' : 'overtime';
              const label = zones.find(item => item.key === zone)!.label;
              return <li key={person.id} className="py-3" data-daily-person={person.id}>
                <div className="flex items-start gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-bold text-brand" aria-label={person.rank === null ? 'Sans rang' : `Rang ${person.rank}`}>{person.rank === 1 ? '🏆' : person.rank ?? '—'}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold" title={person.name}>{person.name}</p><p className="mt-1 text-[10px] text-muted">{formatTime(person.speakingSeconds)} / {formatTime(person.budgetSeconds)} · {measured ? `${Math.round(ratio * 100)} % utilisés` : 'Non mesuré'}</p></div><strong className="shrink-0 text-sm tabular-nums text-brand">{person.score ?? '—'} pts</strong></div>
                <svg viewBox="0 0 100 3" preserveAspectRatio="none" className="mt-2 h-1.5 w-full rounded-full" role="img" aria-label={`Score de ${person.name} : ${person.score ?? 'non noté'} sur 1 000`}><rect width="100" height="3" rx="1.5" className="fill-slate-100" /><rect width={(person.score ?? 0) / 10} height="3" rx="1.5" className="fill-brand" /></svg>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-x-1"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${colors[zone]}`}>{label}</span><ScoreBreakdown person={person} /></div>
                <p className="truncate text-[10px] text-muted" title={person.meterTitle ?? undefined}>Humeur {person.mood ?? '—'}{person.meterTitle ? ` · ${person.meterTitle}` : ''}</p>
              </li>;
            })}
          </ol>
          {pages > 1 && <nav className="flex flex-wrap items-center justify-between gap-1 border-t border-line pt-2" aria-label="Pages du classement du jour"><Button sx={{ minHeight: 44, minWidth: 44, fontSize: 11 }} disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Page précédente du bilan">← Précédent</Button><span className="text-xs text-muted" aria-live="polite">{current + 1} / {pages}</span><Button sx={{ minHeight: 44, minWidth: 44, fontSize: 11 }} disabled={current === pages - 1} onClick={() => setPage(current + 1)} aria-label="Page suivante du bilan">Suivant →</Button></nav>}
        </section>
        <div className="space-y-4">
          <section className={panel} aria-labelledby="daily-zones-heading"><h2 id="daily-zones-heading" className="text-base font-bold text-brand">Équilibre des prises de parole</h2><p className="mt-1 text-xs text-muted">Zone optimale : de ¼ à 100 % du budget initial. Les zones décrivent le temps, pas la qualité.</p><dl className="mt-4 space-y-3">{zones.map(zone => <div key={zone.key}><div className="flex items-center justify-between gap-2 text-xs"><dt className={`rounded-full px-2 py-1 font-semibold ${colors[zone.key]}`}>{zone.label}</dt><dd className="font-bold tabular-nums">{zone.count} / {round.people.length}</dd></div><svg className="mt-1 h-2 w-full" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="4" rx="2" className="fill-slate-100" /><rect width={round.people.length ? zone.count / round.people.length * 100 : 0} height="4" rx="2" className={zone.key === 'optimal' ? 'fill-success' : zone.key === 'overtime' ? 'fill-danger' : zone.key === 'short' ? 'fill-accent' : 'fill-slate-400'} /></svg></div>)}</dl><p className="mt-4 border-t border-line pt-3 text-xs text-muted">Temps moyen : <strong className="text-brand">{stats.averageSeconds === null ? '—' : formatTime(stats.averageSeconds)}</strong> par passage mesuré.</p></section>
          <section className={panel} aria-labelledby="daily-moods-heading"><h2 id="daily-moods-heading" className="text-base font-bold text-brand">Repères d’humeur</h2><p className="mt-1 text-xs text-muted">Catégories choisies, pas des notes de bonheur. Les repères de baromètres différents ne sont pas directement comparables.</p><dl className="mt-3 grid grid-cols-2 gap-2">{stats.moods.map(({ mood, count }) => <div key={mood} className="rounded-lg bg-slate-50 p-3"><dt className="text-[11px] text-muted">Catégorie {mood}</dt><dd className="text-xl font-bold tabular-nums text-brand">{count}</dd></div>)}</dl>{stats.missingMoods > 0 && <p className="mt-2 text-xs text-muted">Sans catégorie : {stats.missingMoods}</p>}</section>
          <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><h2 className="text-sm font-bold text-brand">Comment lire ce bilan ?</h2><p className="mt-2 text-xs leading-relaxed text-muted">Le score concerne uniquement la gestion du temps. Le bouton « Détail du score » explique chaque résultat et les limites des archives. Le classement des cinq derniers jours utilise la moyenne des scores.</p><div className="mt-2 flex flex-wrap gap-2"><Button component={Link} href="/statistics" sx={{ minHeight: 44, fontSize: 11 }}>Statistiques sur 5 jours →</Button><Button component={Link} href="/help#score" sx={{ minHeight: 44, fontSize: 11 }}>Guide du score →</Button></div></section>
        </div>
      </div>
    </>}
  </div>;
}