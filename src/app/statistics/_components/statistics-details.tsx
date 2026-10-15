'use client';

import { Dialog, DialogActions, DialogContent, DialogTitle, Button } from '@mui/material';
import { PaginatedList } from '@/components/ui/paginated-list';
import { ScoreBreakdown } from '@/components/ui/score-breakdown';
import { HISTORY_DAYS, type HistoryRound, type historyLeaderboard } from '@/lib/history';

const numberFormat = new Intl.NumberFormat('fr-FR');
const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
const roundFormat = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function duration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  return minutes ? `${numberFormat.format(minutes)} min ${rounded % 60} s` : `${rounded} s`;
}

export function dateLabel(value: string, full = false) {
  // Date-only summaries represent calendar days, not UTC instants.
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : (full ? roundFormat : dayFormat).format(date);
}

export type RankedPerson = ReturnType<typeof historyLeaderboard>[number];

export function StatisticsDetails({ methodology, notice, round, person, onClose }: {
  methodology: boolean; notice: string; round: HistoryRound | null; person: RankedPerson | null; onClose: () => void;
}) {
  const meters = round ? [...new Set(round.people.map(p => p.meterTitle).filter((title): title is string => Boolean(title)))] : [];
  return <>
    <Dialog open={methodology} onClose={onClose} aria-labelledby="statistics-methodology-title" fullWidth maxWidth="sm">
      <DialogTitle id="statistics-methodology-title">Comprendre ces statistiques</DialogTitle>
      <DialogContent dividers className="space-y-4 text-sm leading-relaxed">
        {notice && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-danger">{notice}</p>}
        <p><strong>{HISTORY_DAYS} jours UTC, aujourd’hui inclus.</strong> Les bilans plus anciens sont supprimés de la base au chargement ou à l’enregistrement d’un bilan de cette équipe. La source de vérité est exclusivement Neon.</p>
        <p>Le classement utilise le score moyen enregistré sur 1 000, pour ne pas favoriser ceux qui jouent davantage. Égalités au même rang, rang suivant sauté ; passages non mesurés exclus. Les scores historiques ne sont pas recalculés.</p>
        <p>Moyenne de parole et respect du temps : passages mesurés (≥ 1 s et budget positif) uniquement. Le temps cumulé exclut les pauses. Un tiret signifie non mesuré ou indisponible ; zéro est une valeur réelle.</p>
        <p>Les choix d’humeur 1 à 4 sont des catégories, pas des notes de bonheur. Les numéros ne sont pas comparables entre baromètres et ne changent jamais le score.</p>
        <p>Les scores portent sur la gestion du temps, jamais sur la qualité d’une contribution. « Points récents » présente les 10 derniers bilans de cette fenêtre ; leurs détails conservent le calcul explicatif du score individuel.</p>
      </DialogContent>
      <DialogActions><Button onClick={onClose} className="min-h-11" autoFocus>Fermer</Button></DialogActions>
    </Dialog>
    <Dialog open={Boolean(person)} onClose={onClose} aria-labelledby="statistics-person-title" fullWidth maxWidth="sm">
      {person && <>
        <DialogTitle id="statistics-person-title" className="break-words">{person.name}</DialogTitle>
        <DialogContent dividers className="space-y-3 text-sm">
          <p>{person.rank === null ? 'Sans rang · aucun passage noté' : `Rang ${person.rank} · égalités partagées`}</p>
          <p className="font-semibold text-brand">Score moyen : {person.averageScore === null ? '—' : numberFormat.format(person.averageScore)} / 1 000</p>
          <p>{person.scored} / {person.turns} passages mesurés et notés · {person.withinTime} dans le temps.</p>
          <p>Parole moyenne des passages notés : {person.averageSeconds === null ? 'non mesurée' : duration(person.averageSeconds)}.</p>
          <p className="text-muted">Pour comprendre un score enregistré, ouvrez le point correspondant dans « Points récents », puis « Détail du score ».</p>
        </DialogContent>
        <DialogActions><Button onClick={onClose} className="min-h-11" autoFocus>Fermer</Button></DialogActions>
      </>}
    </Dialog>
    <Dialog open={Boolean(round)} onClose={onClose} aria-labelledby="statistics-round-title" fullWidth maxWidth="sm" className="[&_.MuiDialog-paper]:m-3 [&_.MuiDialog-paper]:w-[calc(100%-24px)]">
      {round && <div className="flex h-[min(640px,calc(100dvh-48px))] min-h-0 flex-col overflow-hidden p-3">
        <header className="shrink-0"><h2 id="statistics-round-title" className="text-sm font-bold text-brand">Point du {dateLabel(round.completedAt, true)}</h2><p className="mt-1 text-[11px] text-muted">{round.people.length} tours · {duration(round.people.reduce((sum, p) => sum + p.speakingSeconds, 0))} hors pauses</p></header>
        <p className="mt-2 shrink-0 truncate text-[10px] text-muted" title={meters.join(' · ')}>Mood meters : {meters.length ? meters.join(' · ') : 'non renseignés'}</p>
        <PaginatedList key={round.id} items={round.people} className="statistics-round-people" renderItem={p => <li key={p.id} className="flex h-20 shrink-0 items-center gap-2 border-b border-line px-1">
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold" title={p.name}>{p.name}</p><p className="mt-1 text-[10px] text-muted">{duration(p.speakingSeconds)} / {duration(p.budgetSeconds)}</p><p className="text-[9px] text-muted">{p.speakingSeconds < 1 || p.budgetSeconds <= 0 ? 'Non mesuré' : p.speakingSeconds > p.budgetSeconds ? 'Temps dépassé' : 'Dans le temps'} · {p.mood === null ? 'Sans catégorie' : `Catégorie ${p.mood}`}</p></div>
          <div className="flex shrink-0 flex-col items-end"><strong className="text-xs text-brand">{p.score ?? '—'} pts</strong><ScoreBreakdown person={p} /></div>
        </li>} />
        <Button onClick={onClose} className="min-h-11 shrink-0 self-end" autoFocus>Fermer</Button>
      </div>}
    </Dialog>
  </>;
}