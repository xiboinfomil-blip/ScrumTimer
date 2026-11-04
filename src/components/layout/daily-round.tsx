'use client';

import { useState } from 'react';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import RemoveIcon from '@mui/icons-material/Remove';
import { useTeam } from '@/providers/team-provider';
import { DailyDashboard } from './daily-dashboard';

/** Available on every device, even after the transient timer/session is gone. */
export function DailyRound() {
  const { todayRound: round, activeTeamName } = useTeam();
  const [view, setView] = useState(false);
  if (!round) return null;
  return <section className="mx-auto flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden max-[650px]:gap-2 [@media(max-height:650px)]:gap-1" aria-label="Point quotidien du jour">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-3 [@media(max-height:650px)]:pb-1">
      <div className="min-w-0 flex-1 basis-56">
        <h1 className="text-xl font-bold tracking-tight text-ink">Bilan du jour</h1>
        <p className="mt-1 flex items-center gap-2 text-xs text-success"><span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success" />Point terminé · {new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Mauritius', day: 'numeric', month: 'long' }).format(new Date(round.completedAt))}</p>
        <p className="mt-1 truncate text-xs text-muted" title={activeTeamName}>{activeTeamName} · {round.people.length} participants</p>
        <span className="sr-only">Point quotidien terminé aujourd’hui</span>
      </div>
      <div className="flex shrink-0 items-center gap-2 max-[650px]:w-full">
        <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-dark motion-reduce:transition-none max-[650px]:flex-1" aria-label={view ? 'Masquer le bilan' : 'Voir le bilan du jour'} onClick={() => setView(value => !value)} aria-expanded={view} aria-controls="daily-dashboard">{view ? 'Masquer le bilan' : 'Voir le bilan'}{view ? <RemoveIcon className="size-4" fontSize="inherit" aria-hidden="true" /> : <NorthEastIcon className="size-4" fontSize="inherit" aria-hidden="true" />}</button>
      </div>
    </header>
    <DailyDashboard round={round} expanded={view} />
  </section>;
}