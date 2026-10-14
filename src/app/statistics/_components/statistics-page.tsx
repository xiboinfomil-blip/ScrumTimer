'use client';

import { useEffect, useState } from 'react';
import { type HistoryRound, historyLeaderboard, normalizeHistory, summarizeDays } from '@/lib/history';
import { useTeam } from '@/providers/team-provider';
import { card, routeStage, secondaryButton } from '@/components/ui/styles';

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
  const { ready, cloudStatus } = useTeam();
  const [rounds, setRounds] = useState<HistoryRound[]>([]);
  const [source, setSource] = useState<HistorySource>('loading');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [leaderboardPage, setLeaderboardPage] = useState(0);

  useEffect(() => {
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
        });
        if (!response.ok) throw new Error(response.status === 503 ? 'unconfigured' : 'request');
        const payload: { rounds?: HistoryRound[] } = await response.json();
        if (!Array.isArray(payload.rounds)) throw new Error('response');
        if (!active || controller.signal.aborted) return;
        setRounds(normalizeHistory(payload.rounds));
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
  }, [refresh, cloudStatus]);

  const days = summarizeDays(rounds);
  const leaderboard = historyLeaderboard(rounds);
  const leaderboardPages = Math.max(1, Math.ceil(leaderboard.length / 8));
  const currentLeaderboardPage = Math.min(leaderboardPage, leaderboardPages - 1);
  const people = rounds.flatMap((round) => round.people);
  const seconds = people.reduce((sum, person) => sum + person.speakingSeconds, 0);
  const measured = people.filter(person => person.speakingSeconds >= 1 && person.budgetSeconds > 0);
  const withinTime = measured.filter((person) => !person.timeUp && person.speakingSeconds <= person.budgetSeconds).length;
  const moods = ([1, 2, 3, 4] as const).map((mood) => ({
    mood, count: people.filter((person) => person.mood === mood).length,
  }));
  const missingMoods = people.filter((person) => person.mood === null).length;
  const maximumRounds = Math.max(1, ...days.map((day) => day.rounds));
  const recent = [...rounds].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 10);
  const loading = source === 'loading';
  const teamStatus = !ready || cloudStatus === 'loading' ? 'Chargement de l’équipe…'
    : cloudStatus === 'saved' ? 'Équipe enregistrée dans Neon'
      : cloudStatus === 'saving' ? 'Enregistrement de l’équipe dans Neon…'
        : 'Échec de l’enregistrement de l’équipe dans Neon';
  const historyStatus = source === 'neon' ? 'Historique chargé depuis Neon'
    : source === 'unavailable' ? 'Historique Neon indisponible' : 'Chargement de l’historique…';
  const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

  return (
    <section aria-labelledby="statistics-heading" className={`${routeStage} mx-auto w-full max-w-5xl overflow-y-auto p-1`}>
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 id="statistics-heading" className="text-xl font-bold text-brand">Statistiques</h1>
          <p className="text-xs text-muted">Les 10 derniers jours UTC, en un coup d’œil.</p>
        </div>
        <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)} className={`${secondaryButton} ${focus}`}>
          {loading ? 'Chargement…' : source === 'neon' ? 'Actualiser' : 'Réessayer'}
        </button>
      </header>

      <div role="status" aria-live="polite" className="shrink-0 text-[11px] text-muted">
        <p>{historyStatus} · {teamStatus}</p>
        {notice && <p className="mt-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-orange-900">{notice}</p>}
      </div>

      <div aria-busy={loading} className="flex flex-col gap-2">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Points terminés', numberFormat.format(rounds.length)],
            ['Tours de parole', numberFormat.format(people.length)],
            ['Parole moyenne', measured.length ? duration(measured.reduce((sum, p) => sum + p.speakingSeconds, 0) / measured.length) : '—'],
            ['Dans le temps imparti', measured.length ? `${Math.round(withinTime / measured.length * 100)} %` : '—'],
          ].map(([label, value]) => (
            <div key={label} className={`${card} p-3`}>
              <dt className="text-[11px] text-muted">{label}</dt>
              <dd key={value} className="mt-1 text-lg font-bold tabular-nums text-brand motion-safe:animate-page-reveal">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[10px] text-muted">10 jours UTC · {duration(seconds)} de parole. Moyenne et respect du temps : passages mesurés (≥ 1 s) uniquement. Les numéros d’humeur ne sont pas comparables entre baromètres.</p>

        <section aria-labelledby="daily-heading" className={`${card} p-3`}>
          <h2 id="daily-heading" className="text-sm font-semibold text-brand">Activité · 10 derniers jours</h2>
          <p className="mb-2 text-[11px] text-muted">Nombre de points terminés par jour.</p>
          <ol className="grid grid-cols-10 gap-1 sm:gap-3">
            {days.map((day) => (
              <li key={day.date} className="min-w-0 text-center">
                <span className="sr-only">{dateLabel(day.date)} : {day.rounds} points, {day.participants} tours de parole, {duration(day.seconds)}.</span>
                <div aria-hidden="true">
                  <span className="text-[10px] font-semibold tabular-nums text-brand">{day.rounds}</span>
                  <svg viewBox="0 0 24 80" className="mx-auto h-20 w-full max-w-8" focusable="false">
                    <rect x="3" y="0" width="18" height="80" rx="3" className="fill-slate-100" />
                    <rect key={day.rounds} x="3" y={80 - day.rounds / maximumRounds * 80} width="18" height={day.rounds / maximumRounds * 80} rx="3" className="origin-bottom fill-brand motion-safe:animate-chart-grow" />
                  </svg>
                  <span className="mt-1 block text-[9px] tabular-nums text-muted sm:text-[11px]">{dateLabel(day.date)}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="leaderboard-heading" className={`${card} p-3`}>
          <h2 id="leaderboard-heading" className="text-sm font-semibold text-brand">Classement des participants · 10 jours</h2>
          <p className="mt-1 text-[11px] text-muted">Score moyen sur 1 000, pour ne pas favoriser ceux qui jouent davantage. Égalités au même rang ; passages non mesurés exclus. Les humeurs ne changent jamais le score.</p>
          {!leaderboard.length ? <p className="py-3 text-xs text-muted">Terminez un tour pour voir le classement.</p> : <>
            <ol key={currentLeaderboardPage} className="mt-2 divide-y divide-line motion-safe:animate-page-reveal" start={currentLeaderboardPage * 8 + 1} aria-label="Classement des participants">
              {leaderboard.slice(currentLeaderboardPage * 8, currentLeaderboardPage * 8 + 8).map(person => <li key={person.id} className="flex min-h-14 items-center gap-2 py-2 text-xs">
                <span className={`w-7 shrink-0 text-center font-bold tabular-nums ${person.rank === 1 ? 'text-amber-700' : 'text-muted'}`} aria-label={person.rank === null ? 'Sans rang' : `Rang ${person.rank}`}>{person.rank === 1 ? '🏆' : person.rank ?? '—'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-brand" title={person.name}>{person.name}</p>
                  <p className="mt-0.5 text-[10px] text-muted">{person.scored} / {person.turns} passages mesurés · {person.averageSeconds === null ? 'Temps non mesuré' : `${duration(person.averageSeconds)} en moyenne`}<span className="max-[400px]:hidden"> · {person.withinTime} dans le temps</span></p>
                </div>
                <span className="shrink-0 text-right font-bold tabular-nums text-brand">{person.averageScore === null ? '—' : numberFormat.format(person.averageScore)}<span className="block text-[9px] font-normal text-muted">/ 1 000</span></span>
              </li>)}
            </ol>
            {leaderboardPages > 1 && <div className="mt-1 flex items-center justify-between gap-2 border-t border-line pt-1 text-[11px] text-muted">
              <button type="button" className="min-h-11 rounded-lg px-2 text-brand disabled:opacity-40" aria-label="Page précédente du classement" disabled={currentLeaderboardPage === 0} onClick={() => setLeaderboardPage(currentLeaderboardPage - 1)}>← Précédent</button>
              <span aria-live="polite">{currentLeaderboardPage + 1} / {leaderboardPages}</span>
              <button type="button" className="min-h-11 rounded-lg px-2 text-brand disabled:opacity-40" aria-label="Page suivante du classement" disabled={currentLeaderboardPage === leaderboardPages - 1} onClick={() => setLeaderboardPage(currentLeaderboardPage + 1)}>Suivant →</button>
            </div>}
          </>}
        </section>

        <section aria-labelledby="moods-heading" className={`${card} p-3`}>
          <h2 id="moods-heading" className="text-sm font-semibold text-brand">Catégories d’humeur</h2>
          <p className="mt-1 text-[11px] text-muted">Choix 1 à 4 selon le mood meter utilisé : des catégories, pas des notes de bonheur.</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {moods.map(({ mood, count }) => (
              <div key={mood} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-xs text-muted">Catégorie {mood}</dt>
                <dd className="text-sm font-semibold tabular-nums text-brand">{numberFormat.format(count)}</dd>
              </div>
            ))}
          </dl>
          {missingMoods > 0 && <p className="mt-2 text-[11px] text-muted">Sans catégorie renseignée : {numberFormat.format(missingMoods)}.</p>}
        </section>

        <section aria-labelledby="recent-heading" className={`${card} p-3`}>
          <h2 id="recent-heading" className="text-sm font-semibold text-brand">Points récents</h2>
          <p className="mt-1 text-[11px] text-muted">Les 10 derniers points · durée de parole cumulée, hors pauses.</p>
          {!recent.length ? (
            <p className="py-4 text-center text-xs text-muted">{loading ? 'Chargement des points…' : source === 'unavailable' ? 'Aucun historique accessible pour le moment.' : 'Aucun point terminé dans cet historique.'}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {recent.map((round) => {
                const total = round.people.reduce((sum, person) => sum + person.speakingSeconds, 0);
                const meters = [...new Set(round.people.map((person) => person.meterTitle).filter((title): title is string => Boolean(title)))];
                return (
                  <li key={round.id} className="py-2">
                    <details className="group">
                      <summary className={`cursor-pointer rounded-lg py-1 text-xs text-brand ${focus}`}>
                        <time dateTime={round.completedAt} className="font-semibold">{dateLabel(round.completedAt, true)}</time>
                        <span className="ml-2 text-muted">{round.people.length} tours · {duration(total)}</span>
                        <span className="sr-only"> · Détails des participants</span>
                      </summary>
                      <p className="mt-1 break-words text-[11px] text-muted">Mood meters : {meters.length ? meters.join(' · ') : 'non renseignés'}</p>
                      <ul className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2">
                        {round.people.map((person, index) => (
                          <li key={`${person.id}-${index}`} className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[11px]">
                            <span className="min-w-0 break-words font-medium text-brand">{person.name}</span>
                            <span className="text-muted">{duration(person.speakingSeconds)} / {duration(person.budgetSeconds)} · {person.speakingSeconds < 1 || person.budgetSeconds <= 0 ? 'Non mesuré' : person.timeUp || person.speakingSeconds > person.budgetSeconds ? 'Temps imparti atteint ou dépassé' : 'Dans le temps'} · {person.mood === null ? 'Sans catégorie' : `Catégorie ${person.mood}`}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}