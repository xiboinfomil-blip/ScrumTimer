'use client';

import { useState } from 'react';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import RemoveIcon from '@mui/icons-material/Remove';
import { useRouter } from 'next/navigation';
import { useTeam } from '@/providers/team-provider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DailyDashboard } from './daily-dashboard';

/** Available on every device, even after the transient timer/session is gone. */
export function DailyRound() {
  const { todayRound: round, activeTeamName, resetToday, teamBusy, cloudStatus } = useTeam();
  const router = useRouter();
  const [view, setView] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (!round) return null;
  const reset = async () => {
    setConfirm(false);
    if (await resetToday()) router.replace('/participants');
  };
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
        <button type="button" className="min-h-11 rounded-xl px-3 text-xs font-semibold text-muted hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50" aria-label="Réinitialiser aujourd’hui" disabled={teamBusy || cloudStatus !== 'saved'} onClick={() => setConfirm(true)}><span className="max-[650px]:hidden">Réinitialiser aujourd’hui</span><span className="min-[650px]:hidden">Réinitialiser</span></button>
      </div>
    </header>
    <DailyDashboard round={round} expanded={view} />
    <ConfirmDialog open={confirm} title="Réinitialiser le point du jour ?" description="Le bilan et les humeurs d’aujourd’hui seront supprimés pour toute l’équipe, sur tous les appareils. Les équipes, participants et bilans des jours précédents sont conservés. Vous pourrez refaire le point avec le même baromètre du jour." confirmLabel="Réinitialiser aujourd’hui" danger onConfirm={() => void reset()} onClose={() => setConfirm(false)} />
  </section>;
}