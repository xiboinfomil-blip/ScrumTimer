'use client';

import { useEffect, useState } from 'react';
import { Button, Paper } from '@mui/material';
import { HISTORY_DAYS, type HistoryRound, historyLeaderboard, normalizeHistory, summarizeDays } from '@/lib/history';
import { useTeam } from '@/providers/team-provider';
import { card, routeStage, secondaryButton } from '@/components/ui/styles';
import { ScoreBreakdown } from '@/components/ui/score-breakdown';
import { StatisticsIcon } from './statistics-icon';

type HistorySource = 'loading' | 'neon' | 'unavailable';

const numberFormat = new Intl.NumberFormat('fr-FR');
const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
const roundFormat = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function duration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  return minutes ? `${numberFormat.format(minutes)} min ${rounded % 60} s` : `${rounded} s`;
}

function dateLabel(value: string, full = false) {
  // Date-only summaries represent calendar days, not UTC instants.
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : (full ? roundFormat : dayFormat).format(date);
}

export function StatisticsPage() {
  const { ready, activeTeamId, activeTeamName, cloudStatus } = useTeam();
  const [rounds, setRounds] = useState<HistoryRound[]>([]);
  const [source, setSource] = useState<HistorySource>('loading');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [leaderboardPage, setLeaderboardPage] = useState(0);
  const [loadedTeamId, setLoadedTeamId] = useState<string | null>(null);

  useEffect(() => {
    setRounds([]);
    setLoadedTeamId(null);
    setLeaderboardPage(0);
    setSource('loading');
    setNotice('');
    if (!ready || !activeTeamId) return;
    const teamId = activeTeamId;
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15_000);
    async function loadHistory() {
      setSource('loading');
      setNotice('');
      try {
        const response = await fetch('/api/history', {
          method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          headers: { 'X-Team-Id': teamId },
        });
        if (!response.ok) throw new Error(response.status === 503 ? 'unconfigured' : 'request');
        const payload: { rounds?: HistoryRound[] } = await response.json();
        if (!Array.isArray(payload.rounds)) throw new Error('response');
        if (!active || controller.signal.aborted) return;
        setRounds(normalizeHistory(payload.rounds));
        setLoadedTeamId(teamId);
        setSource('neon');
      } catch (error) {
        if (!active) return;
        const message = timedOut
          ? 'Le chargement de l’historique Neon a dépassé 15 secondes.'
          : error instanceof Error && error.message === 'unconfigured'
            ? 'Historique Neon indisponible (service non configuré ou indisponible).'
            : 'Impossible de charger l’historique Neon.';
        setRounds([]);
        setSource('unavailable');
        setNotice(`${message} Les statistiques utilisent exclusivement Neon. Aucune donnée de remplacement n’est affichée. Réessayez le chargement.`);
      } finally {
        clearTimeout(timeout);
      }
    }
    void loadHistory();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [refresh, cloudStatus, ready, activeTeamId]);

  const visibleRounds = ready && loadedTeamId === activeTeamId ? rounds : [];
  const days = summarizeDays(visibleRounds);
  const leaderboard = historyLeaderboard(visibleRounds);
  const leaderboardPages = Math.max(1, Math.ceil(leaderboard.length / 8));
  const currentLeaderboardPage = Math.min(leaderboardPage, leaderboardPages - 1);
  const people = visibleRounds.flatMap((round) => round.people);
  const seconds = people.reduce((sum, person) => sum + person.speakingSeconds, 0);
  const measured = people.filter(person => person.speakingSeconds >= 1 && person.budgetSeconds > 0);
  const withinTime = measured.filter((person) => person.speakingSeconds <= person.budgetSeconds).length;
  const moods = ([1, 4, 2, 3] as const).map((mood) => ({
    mood, count: people.filter((person) => person.mood === mood).length,
  }));
  const missingMoods = people.filter((person) => person.mood === null).length;
  const maximumRounds = Math.max(1, ...days.map((day) => day.rounds));
  const recent = [...visibleRounds].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 10);
  const loading = source === 'loading';
  const teamStatus = !ready || cloudStatus === 'loading' ? 'Chargement de l’équipe…'
    : cloudStatus === 'saved' ? 'Équipe enregistrée dans Neon'
      : cloudStatus === 'saving' ? 'Enregistrement de l’équipe dans Neon…'
        : 'Échec de l’enregistrement de l’équipe dans Neon';
  const historyStatus = source === 'neon' ? 'Historique chargé depuis Neon'
    : source === 'unavailable' ? 'Historique Neon indisponible' : 'Chargement de l’historique…';
  const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

  return (
    <section aria-labelledby="statistics-heading" className={`${routeStage} mx-auto w-full max-w-6xl overflow-y-auto p-1 pr-2`}>
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-brand max-[650px]:hidden"><StatisticsIcon name="chart" className="size-5" /></span>
          <div className="min-w-0"><h1 id="statistics-heading" className="text-[23px] font-bold tracking-tight text-ink max-[650px]:text-lg">Le rythme de l’équipe<span className="text-accent">.</span></h1>
          <p className="mt-0.5 truncate text-[11px] text-muted" title={activeTeamName}>{activeTeamName} · Les {HISTORY_DAYS} derniers jours UTC, aujourd’hui inclus.</p></div>
        </div>
        <Button disableElevation size="small" variant="outlined" sx={{ minHeight: 44, minWidth: 0, textTransform: 'none', fontSize: 12 }} type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)} className={`${secondaryButton} shrink-0 rounded-xl ${focus}`}>
          <StatisticsIcon name="refresh" className={`size-4 shrink-0 ${loading ? 'motion-safe:animate-spin' : ''}`} />
          {loading ? 'Chargement…' : source === 'neon' ? 'Actualiser' : 'Réessayer'}
        </Button>
      </header>

      <div role="status" aria-live="polite" className="shrink-0 text-[10px] text-muted">
        <p className="flex items-center gap-1.5"><span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${source === 'unavailable' ? 'bg-danger' : loading ? 'bg-accent motion-safe:animate-pulse' : 'bg-success'}`} />{historyStatus}<span className="max-[650px]:sr-only"> · {teamStatus}</span></p>
        {notice && <p className="mt-2 rounded-xl border border-red-200 bg-danger-soft px-3 py-2 text-danger">{notice}</p>}
      </div>

      <div aria-busy={loading} className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Indicateurs des cinq derniers jours">
          {[
            { label: 'Points terminés', value: numberFormat.format(visibleRounds.length), icon: 'calendar' as const },
            { label: 'Tours de parole', value: numberFormat.format(people.length), icon: 'people' as const },
            { label: 'Parole moyenne', value: measured.length ? duration(measured.reduce((sum, p) => sum + p.speakingSeconds, 0) / measured.length) : '—', icon: 'clock' as const },
            { label: 'Dans le temps imparti', value: measured.length ? `${Math.round(withinTime / measured.length * 100)} %` : '—', icon: 'check' as const },
          ].map(({ label, value, icon }) => (
            <Paper component="div" elevation={0} key={label} className={`${card} relative overflow-hidden rounded-2xl border-slate-200/80 p-3 sm:p-4`}>
              <dt className="flex items-center justify-between gap-2 text-[10px] font-medium text-muted"><span>{label}</span><StatisticsIcon name={icon} className={`size-4 shrink-0 ${icon === 'check' ? 'text-success' : 'text-brand/70'}`} /></dt>
              <dd key={value} className="mt-2 text-xl font-bold tracking-tight tabular-nums text-ink motion-safe:animate-page-reveal sm:text-2xl">{loading || source === 'unavailable' ? '—' : value}</dd>
            </Paper>
          ))}
        </dl>
        <p className="flex items-center gap-2 px-1 text-[11px] text-muted"><StatisticsIcon name="clock" className="size-3.5 shrink-0" /><span><strong className="font-semibold text-ink">{loading || source === 'unavailable' ? '—' : duration(seconds)}</strong> de parole cumulée · {HISTORY_DAYS} jours UTC</span></p>
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex min-w-0 flex-col gap-3">

        <Paper component="section" elevation={0} aria-labelledby="daily-heading" className={`${card} rounded-2xl border-slate-200/80 p-4`}>
          <h2 id="daily-heading" className="text-sm font-semibold text-brand">Activité · {HISTORY_DAYS} derniers jours</h2>
          <p className="mb-2 text-[11px] text-muted">Nombre de points terminés par jour.</p>
          <ol className="grid grid-cols-5 gap-1 sm:gap-3">
            {days.map((day) => (
              <li key={day.date} className="min-w-0 text-center">
                <span className="sr-only">{dateLabel(day.date)} : {day.rounds} points, {day.participants} tours de parole, {duration(day.seconds)}.</span>
                <div aria-hidden="true">
                  <span className="text-[10px] font-semibold tabular-nums text-brand">{day.rounds}</span>
                  <svg viewBox="0 0 24 80" className="mx-auto mt-2 h-28 w-full max-w-10" focusable="false">
                    <rect x="3" y="0" width="18" height="80" rx="3" className="fill-slate-100" />
                    <rect key={day.rounds} x="3" y={80 - day.rounds / maximumRounds * 80} width="18" height={day.rounds / maximumRounds * 80} rx="3" className={`origin-bottom motion-safe:animate-chart-grow ${day.date === days[days.length - 1]?.date ? 'fill-accent' : 'fill-brand'}`} />
                  </svg>
                  <span className="mt-1 block text-[9px] tabular-nums text-muted sm:text-[11px]">{dateLabel(day.date)}</span>
                </div>
              </li>
            ))}
          </ol>
        </Paper>

        <Paper component="section" elevation={0} aria-labelledby="leaderboard-heading" className={`${card} rounded-2xl border-slate-200/80 p-4`}>
          <h2 id="leaderboard-heading" className="text-sm font-semibold text-brand">Classement des participants · {HISTORY_DAYS} jours</h2>
          <p className="mt-1 text-[11px] text-muted">Score moyen sur 1 000, pour ne pas favoriser ceux qui jouent davantage. Égalités au même rang ; passages non mesurés exclus. Les humeurs ne changent jamais le score.</p>
          {!leaderboard.length ? <p className="mt-3 rounded-xl border border-dashed border-line bg-slate-50/60 px-3 py-6 text-center text-xs text-muted">{loading ? 'Chargement du classement…' : source === 'unavailable' ? 'Classement indisponible pour le moment.' : 'Terminez un tour pour voir le classement.'}</p> : <>
            <ol key={currentLeaderboardPage} className="mt-3 space-y-1.5 motion-safe:animate-page-reveal" start={currentLeaderboardPage * 8 + 1} aria-label="Classement des participants">
              {leaderboard.slice(currentLeaderboardPage * 8, currentLeaderboardPage * 8 + 8).map(person => <li key={person.id} className={`flex min-h-18 items-center gap-2 rounded-xl border p-2 text-xs ${person.rank === 1 ? 'border-amber-200/70 bg-amber-50/40' : 'border-line bg-slate-50/40'}`}>
                <span className={`grid size-7 shrink-0 place-items-center rounded-lg text-center font-bold tabular-nums ${person.rank === 1 ? 'bg-amber-100 text-amber-800' : 'bg-white text-muted'}`} aria-label={person.rank === null ? 'Sans rang' : `Rang ${person.rank}`}>{person.rank ?? '—'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink" title={person.name}>{person.name}</p>
                  <p className="mt-0.5 text-[10px] text-muted">{person.scored} / {person.turns} passages mesurés · {person.averageSeconds === null ? 'Temps non mesuré' : `${duration(person.averageSeconds)} en moyenne`}<span className="max-[400px]:hidden"> · {person.withinTime} dans le temps</span></p>
                  <svg viewBox="0 0 100 3" preserveAspectRatio="none" className="mt-2 h-1 w-full" aria-hidden="true"><rect width="100" height="3" rx="1.5" className="fill-slate-200/70" /><rect width={(person.averageScore ?? 0) / 10} height="3" rx="1.5" className="origin-left fill-brand motion-safe:animate-chart-grow" /></svg>
                </div>
                <span className="shrink-0 text-right font-bold tabular-nums text-brand">{person.averageScore === null ? '—' : numberFormat.format(person.averageScore)}<span className="block text-[9px] font-normal text-muted">/ 1 000</span></span>
              </li>)}
            </ol>
            {leaderboardPages > 1 && <div className="mt-1 flex items-center justify-between gap-2 border-t border-line pt-1 text-[11px] text-muted">
              <Button disableElevation size="small" variant="text" sx={{ minHeight: 44, minWidth: 0, textTransform: 'none', fontSize: 11 }} type="button" className="min-h-11 rounded-lg px-2 text-brand disabled:opacity-40" aria-label="Page précédente du classement" disabled={currentLeaderboardPage === 0} onClick={() => setLeaderboardPage(currentLeaderboardPage - 1)}>← Précédent</Button>
              <span aria-live="polite">{currentLeaderboardPage + 1} / {leaderboardPages}</span>
              <Button disableElevation size="small" variant="text" sx={{ minHeight: 44, minWidth: 0, textTransform: 'none', fontSize: 11 }} type="button" className="min-h-11 rounded-lg px-2 text-brand disabled:opacity-40" aria-label="Page suivante du classement" disabled={currentLeaderboardPage === leaderboardPages - 1} onClick={() => setLeaderboardPage(currentLeaderboardPage + 1)}>Suivant →</Button>
            </div>}
          </>}
        </Paper>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
        <Paper component="section" elevation={0} aria-labelledby="moods-heading" className={`${card} rounded-2xl border-slate-200/80 p-4`}>
          <h2 id="moods-heading" className="text-sm font-semibold text-brand">Catégories d’humeur</h2>
          <p className="mt-1 text-[11px] text-muted">Choix 1 à 4 selon le mood meter utilisé : des catégories, pas des notes de bonheur.</p>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            {moods.map(({ mood, count }) => (
              <div key={mood} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-slate-50/70 p-3">
                <dt className="flex items-center gap-2 text-[11px] text-muted"><span className="grid size-6 shrink-0 place-items-center rounded-md bg-white font-semibold text-brand" aria-hidden="true">{mood}</span><span>Catégorie {mood}</span></dt>
                <dd className="text-lg font-bold tabular-nums text-ink">{loading || source === 'unavailable' ? '—' : numberFormat.format(count)}</dd>
              </div>
            ))}
          </dl>
          {missingMoods > 0 && <p className="mt-2 text-[11px] text-muted">Sans catégorie renseignée : {numberFormat.format(missingMoods)}.</p>}
        </Paper>

        <Paper component="section" elevation={0} aria-labelledby="recent-heading" className={`${card} rounded-2xl border-slate-200/80 p-4`}>
          <h2 id="recent-heading" className="text-sm font-semibold text-brand">Points récents</h2>
          <p className="mt-1 text-[11px] text-muted">Les 10 derniers points · durée de parole cumulée, hors pauses.</p>
          {!recent.length ? (
            <p className="mt-3 rounded-xl border border-dashed border-line bg-slate-50/60 px-3 py-6 text-center text-xs text-muted">{loading ? 'Chargement des points…' : source === 'unavailable' ? 'Aucun historique accessible pour le moment.' : 'Aucun point terminé dans cet historique.'}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recent.map((round) => {
                const total = round.people.reduce((sum, person) => sum + person.speakingSeconds, 0);
                const meters = [...new Set(round.people.map((person) => person.meterTitle).filter((title): title is string => Boolean(title)))];
                return (
                  <li key={round.id} className="rounded-xl border border-line bg-slate-50/40 p-2">
                    <details className="group">
                      <summary className={`min-h-11 cursor-pointer content-center rounded-lg px-1 py-2 text-xs text-brand ${focus}`}>
                        <time dateTime={round.completedAt} className="font-semibold">{dateLabel(round.completedAt, true)}</time>
                        <span className="mt-1 block pl-4 text-[10px] text-muted">{round.people.length} tours · {duration(total)}</span>
                        <span className="sr-only"> · Détails des participants</span>
                      </summary>
                      <p className="mt-1 break-words text-[11px] text-muted">Mood meters : {meters.length ? meters.join(' · ') : 'non renseignés'}</p>
                      <ul className="mt-2 space-y-2 rounded-xl bg-white p-2">
                        {round.people.map((person, index) => (
                          <li key={`${person.id}-${index}`} className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1 border-b border-line pb-2 text-[11px] last:border-0 last:pb-0">
                            <span className="min-w-0 break-words font-medium text-brand">{person.name}</span>
                            <span className="text-muted">{duration(person.speakingSeconds)} / {duration(person.budgetSeconds)} · {person.speakingSeconds < 1 || person.budgetSeconds <= 0 ? 'Non mesuré' : person.speakingSeconds > person.budgetSeconds ? 'Temps imparti dépassé' : 'Dans le temps'} · {person.mood === null ? 'Sans catégorie' : `Catégorie ${person.mood}`}</span>
                            <div className="flex basis-full items-center justify-between"><span className="font-semibold text-brand">{person.score ?? '—'} pts</span><ScoreBreakdown person={person} /></div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Paper>
        </div>
        </div>
        <details className="rounded-xl border border-line bg-slate-50/70 px-3 text-[10px] text-muted"><summary className={`min-h-11 cursor-pointer content-center font-semibold text-brand ${focus}`}>Comprendre ces statistiques</summary><p className="pb-3 leading-relaxed">{HISTORY_DAYS} jours UTC · Les bilans plus anciens sont supprimés de la base au chargement ou à l’enregistrement d’un bilan de cette équipe. Moyenne et respect du temps : passages mesurés (≥ 1 s) uniquement. Les numéros d’humeur ne sont pas comparables entre baromètres. Les scores portent sur la gestion du temps, jamais sur la qualité d’une contribution.</p></details>
      </div>
    </section>
  );
}