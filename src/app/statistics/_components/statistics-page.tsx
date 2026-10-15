'use client';

import { useEffect, useState } from 'react';
import { HISTORY_DAYS, type HistoryRound, historyLeaderboard, normalizeHistory, summarizeDays } from '@/lib/history';
import { useTeam } from '@/providers/team-provider';
import { routeStage } from '@/components/ui/styles';
import { PaginatedList } from '@/components/ui/paginated-list';
import { StatisticsIcon } from './statistics-icon';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { dateLabel, duration, StatisticsDetails, type RankedPerson } from './statistics-details';

type HistorySource = 'loading' | 'neon' | 'unavailable';

const numberFormat = new Intl.NumberFormat('fr-FR');
type View = 'activity' | 'ranking' | 'moods' | 'recent';
const tabs: { value: View; label: string }[] = [
  { value: 'activity', label: 'Activité' }, { value: 'ranking', label: 'Classement' },
  { value: 'moods', label: 'Humeurs' }, { value: 'recent', label: 'Points récents' },
];
const control = 'min-h-11 min-w-11 rounded-xl px-2 text-[11px] font-semibold text-brand transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand motion-reduce:transition-none';

function ViewTabs({ value, onChange, side }: { value: View; onChange: (view: View) => void; side?: 'left' | 'right' }) {
  return <nav aria-label={side === 'left' ? 'Sections activité et classement' : side === 'right' ? 'Sections humeurs et points' : 'Sections des statistiques'} className={`flex shrink-0 gap-1 rounded-xl bg-slate-100/80 p-1 ${side ? 'max-[1023px]:hidden' : 'min-[1024px]:hidden'}`}>
    {tabs.filter((_, i) => !side || (side === 'left' ? i < 2 : i >= 2)).map(tab => <button key={tab.value} type="button" aria-pressed={value === tab.value} onClick={() => onChange(tab.value)} className={`${control} min-w-0 flex-1 px-1 text-[10px] ${value === tab.value ? 'bg-white text-brand shadow-sm' : 'text-muted'}`}>{tab.label}</button>)}
  </nav>;
}

export function StatisticsPage() {
  const { ready, activeTeamId, activeTeamName, cloudStatus } = useTeam();
  const [rounds, setRounds] = useState<HistoryRound[]>([]);
  const [source, setSource] = useState<HistorySource>('loading');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [left, setLeft] = useState<View>('activity');
  const [right, setRight] = useState<View>('moods');
  const [mobile, setMobile] = useState<View>('activity');
  const [methodology, setMethodology] = useState(false);
  const [selectedRound, setSelectedRound] = useState<HistoryRound | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<RankedPerson | null>(null);
  const [loadedTeamId, setLoadedTeamId] = useState<string | null>(null);

  useEffect(() => {
    setRounds([]);
    setLoadedTeamId(null);
    setSelectedRound(null);
    setSelectedPerson(null);
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
  const unavailable = loading || source === 'unavailable';
  const panel = 'flex min-h-0 min-w-0 flex-1 flex-col';
  const panelVisibility = (view: View, desktop: View) => `${mobile !== view ? 'max-[1023px]:hidden' : ''} ${desktop !== view ? 'min-[1024px]:hidden' : ''}`;
  const empty = (message: string) => <p className="my-2 grid min-h-0 flex-1 place-content-center rounded-xl border border-dashed border-line bg-slate-50/60 px-3 text-center text-xs text-muted">{message}</p>;
  const closeDetails = () => { setMethodology(false); setSelectedRound(null); setSelectedPerson(null); };

  return <section aria-labelledby="statistics-heading" data-statistics-root className={`${routeStage} mx-auto w-full max-w-6xl overflow-hidden p-1`}>
    <header className="flex min-h-11 shrink-0 items-center justify-between gap-1">
      <div className="min-w-0"><h1 id="statistics-heading" className="text-xl font-bold tracking-tight text-ink max-[650px]:text-base">Le rythme de l’équipe<span className="text-accent">.</span></h1><p className="truncate text-[10px] text-muted" title={activeTeamName}>{activeTeamName} · {HISTORY_DAYS} jours UTC</p></div>
      <div className="flex shrink-0 gap-1"><button type="button" aria-label={loading ? 'Chargement…' : source === 'neon' ? 'Actualiser' : 'Réessayer'} disabled={loading} onClick={() => setRefresh(v => v + 1)} className={`${control} flex items-center justify-center gap-2 border border-line disabled:opacity-40`}><StatisticsIcon name="refresh" /><span className="max-[650px]:sr-only">{loading ? 'Chargement…' : source === 'neon' ? 'Actualiser' : 'Réessayer'}</span></button><button type="button" aria-label="Comprendre ces statistiques" onClick={() => setMethodology(true)} className={`${control} border border-line text-base`}>?</button></div>
    </header>
    <div role="status" aria-live="polite" className={`flex shrink-0 items-center gap-1.5 text-[10px] ${notice ? 'text-danger' : 'text-muted'}`}><span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${source === 'unavailable' ? 'bg-danger' : loading ? 'bg-accent' : 'bg-success'}`} /><p>{notice ? 'Neon indisponible · Aucune donnée de remplacement.' : historyStatus}<span className="sr-only"> · {teamStatus}{notice ? ` · ${notice}` : ''}</span></p></div>
    {loading && cloudStatus !== 'error' ? <PageSkeleton variant="statistics" scope="section" label="Chargement du classement et des points…" /> : <div aria-busy={loading} className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <dl className="grid shrink-0 grid-cols-4 divide-x divide-line rounded-xl border border-line bg-white py-2" aria-label="Indicateurs des cinq derniers jours">
        {[
          { label: 'Points terminés', short: 'Points', value: numberFormat.format(visibleRounds.length) },
          { label: 'Tours de parole', short: 'Tours', value: numberFormat.format(people.length) },
          { label: 'Parole moyenne', short: 'Moyenne', value: measured.length ? duration(measured.reduce((sum, p) => sum + p.speakingSeconds, 0) / measured.length) : '—' },
          { label: 'Dans le temps imparti', short: 'À temps', value: measured.length ? `${Math.round(withinTime / measured.length * 100)} %` : '—' },
        ].map(item => <div key={item.label} className="min-w-0 px-1.5 sm:px-3"><dt className="text-[9px] text-muted"><span className="max-[650px]:sr-only">{item.label}</span><span aria-hidden="true" className="min-[650px]:hidden">{item.short}</span></dt><dd className="mt-0.5 whitespace-nowrap text-sm font-bold tracking-tight text-brand tabular-nums sm:text-xl">{unavailable ? '—' : item.value}</dd></div>)}
      </dl>
      <ViewTabs value={mobile} onChange={setMobile} />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 min-[1024px]:grid-cols-2">
        <div data-statistics-pane="left" className={`flex min-h-0 min-w-0 flex-col gap-2 rounded-2xl border border-line bg-white p-2.5 sm:p-3 ${mobile === 'moods' || mobile === 'recent' ? 'max-[1023px]:hidden' : ''}`}>
          <ViewTabs side="left" value={left} onChange={setLeft} />
          <section aria-labelledby="daily-heading" className={`${panel} ${panelVisibility('activity', left)}`}>
            <header className="shrink-0"><h2 id="daily-heading" className="text-xs font-bold text-brand">Activité · {HISTORY_DAYS} derniers jours</h2><p className="mt-1 text-[10px] text-muted">Points terminés par jour · calendrier UTC</p></header>
            {unavailable ? empty('Activité indisponible pour le moment.') : <>
              <ol className="my-2 grid min-h-0 flex-1 grid-cols-5 gap-2" aria-label="Activité sur cinq jours">{days.map(day => <li key={day.date} className="flex min-h-0 min-w-0 flex-col items-center gap-1 text-center">
                <span className="sr-only">{dateLabel(day.date)} : {day.rounds} points, {day.participants} tours de parole, {duration(day.seconds)}.</span>
                <span aria-hidden="true" className="text-xs font-bold text-brand tabular-nums">{day.rounds}</span>
                <svg viewBox="0 0 24 80" preserveAspectRatio="none" className="min-h-0 w-full max-w-10 flex-1" aria-hidden="true" focusable="false"><rect x="3" width="18" height="80" rx="3" className="fill-slate-100" /><rect x="3" y={80 - day.rounds / maximumRounds * 80} width="18" height={day.rounds / maximumRounds * 80} rx="3" className={day.date === days[days.length - 1]?.date ? 'fill-accent' : 'fill-brand'} /></svg>
                <span aria-hidden="true" className="text-[10px] text-muted tabular-nums">{dateLabel(day.date)}</span>
              </li>)}</ol>
              <p className="shrink-0 border-t border-line pt-2 text-[10px] text-muted"><strong className="text-ink">{duration(seconds)}</strong> de parole cumulée, hors pauses.</p>
            </>}
          </section>
          <section aria-labelledby="leaderboard-heading" className={`${panel} ${panelVisibility('ranking', left)}`}>
            <header className="shrink-0"><h2 id="leaderboard-heading" className="text-xs font-bold text-brand">Classement des participants</h2><p className="mt-1 text-[10px] text-muted">Score moyen / 1 000 · égalités partagées</p></header>
            {!leaderboard.length ? empty(source === 'unavailable' ? 'Classement indisponible pour le moment.' : 'Terminez un tour pour voir le classement.') : <PaginatedList key={`${activeTeamId}-${refresh}`} items={leaderboard} ordered className="statistics-ranking-list" renderItem={person => <li key={person.id} data-rank={person.rank ?? 'none'} data-score={person.averageScore ?? 'unavailable'} data-person={person.id} className="flex h-18 shrink-0 items-center gap-2 rounded-xl border border-line bg-slate-50/50 px-2">
              <span className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold tabular-nums ${person.rank === 1 ? 'bg-orange-100 text-amber-800' : 'bg-white text-muted'}`} aria-label={person.rank === null ? 'Sans rang' : `Rang ${person.rank}`}>{person.rank ?? '—'}</span>
              <button type="button" onClick={() => setSelectedPerson(person)} aria-label={`Détails de ${person.name}`} className={`${control} min-w-0 flex-1 px-0 text-left`}><span className="block truncate text-xs text-ink" title={person.name}>{person.name}</span><span className="block text-[9px] font-normal text-muted">{person.scored} / {person.turns} passages notés</span><svg viewBox="0 0 100 3" preserveAspectRatio="none" className="mt-1 h-1 w-full" aria-hidden="true"><rect width="100" height="3" rx="1.5" className="fill-slate-200" /><rect width={(person.averageScore ?? 0) / 10} height="3" rx="1.5" className="fill-brand" /></svg></button>
              <span className="shrink-0 text-right text-xs font-bold text-brand tabular-nums">{person.averageScore === null ? '—' : numberFormat.format(person.averageScore)}<span className="block text-[9px] font-normal text-muted">/ 1 000</span></span>
            </li>} />}
          </section>
        </div>
        <div data-statistics-pane="right" className={`flex min-h-0 min-w-0 flex-col gap-2 rounded-2xl border border-line bg-white p-2.5 sm:p-3 ${mobile === 'activity' || mobile === 'ranking' ? 'max-[1023px]:hidden' : ''}`}>
          <ViewTabs side="right" value={right} onChange={setRight} />
          <section aria-labelledby="moods-heading" className={`${panel} ${panelVisibility('moods', right)}`}>
            <header className="shrink-0"><h2 id="moods-heading" className="text-xs font-bold text-brand">Catégories d’humeur</h2><p className="mt-1 text-[10px] text-muted">Des catégories, pas des notes de bonheur.</p></header>
            <dl className="my-2 grid min-h-0 flex-1 grid-cols-2 gap-2" aria-label="Répartition des catégories">{moods.map(({ mood, count }) => <div key={mood} className="flex min-h-0 flex-col justify-center rounded-xl border border-line bg-slate-50/70 px-3 py-1"><dt className="flex items-center gap-2 text-[10px] text-muted"><span aria-hidden="true" className="grid size-6 place-items-center rounded-lg border border-line bg-white font-bold text-brand">{mood}</span><span>Catégorie {mood}</span></dt><dd className="mt-1 text-2xl font-bold text-ink tabular-nums">{unavailable ? '—' : numberFormat.format(count)}</dd></div>)}</dl>
            <p className="shrink-0 border-t border-line pt-2 text-[10px] text-muted">{unavailable ? 'Données indisponibles.' : missingMoods > 0 ? `Sans catégorie renseignée : ${numberFormat.format(missingMoods)}.` : 'Chaque choix dépend du mood meter utilisé.'}</p>
          </section>
          <section aria-labelledby="recent-heading" className={`${panel} ${panelVisibility('recent', right)}`}>
            <header className="shrink-0"><h2 id="recent-heading" className="text-xs font-bold text-brand">Points récents</h2><p className="mt-1 text-[10px] text-muted">Les 10 derniers points · hors pauses</p></header>
            {!recent.length ? empty(source === 'unavailable' ? 'Aucun historique accessible pour le moment.' : 'Aucun point terminé dans cet historique.') : <PaginatedList key={`${activeTeamId}-${refresh}`} items={recent.map(round => ({ ...round, name: dateLabel(round.completedAt, true) }))} className="statistics-recent-list" renderItem={round => <li key={round.id} data-round={round.id} className="h-18 shrink-0 rounded-xl border border-line bg-slate-50/50"><button type="button" onClick={() => setSelectedRound(round)} aria-label={`Détails du point du ${dateLabel(round.completedAt, true)}`} className={`${control} flex h-full w-full items-center justify-between gap-2 px-3 text-left`}><span className="min-w-0"><time dateTime={round.completedAt} className="block text-xs font-semibold">{dateLabel(round.completedAt, true)}</time><span className="mt-1 block text-[10px] font-normal text-muted">{round.people.length} tours · {duration(round.people.reduce((sum, p) => sum + p.speakingSeconds, 0))}</span></span><span aria-hidden="true" className="text-lg text-accent">↗</span></button></li>} />}
          </section>
        </div>
      </div>
    </div>}
    <StatisticsDetails methodology={methodology} notice={notice} round={selectedRound} person={selectedPerson} onClose={closeDetails} />
  </section>;
}