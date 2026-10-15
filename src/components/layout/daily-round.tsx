'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Paper } from '@mui/material';
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
  return <Paper component="section" variant="outlined" className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-3" aria-label="Point quotidien du jour">
    <div className="flex shrink-0 items-center justify-between gap-2">
      <div className="min-w-0"><h1 className="truncate text-lg font-bold text-brand" title={activeTeamName}>Bilan du jour · {activeTeamName}</h1><p className="text-[10px] text-muted [@media(max-height:650px)]:hidden">{new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Mauritius', day: 'numeric', month: 'short' }).format(new Date(round.completedAt))} · {round.people.length} participants</p></div>
      <span className="shrink-0 text-[10px] font-semibold text-success" title="Point quotidien terminé aujourd’hui">✓ Terminé</span><span className="sr-only">Point quotidien terminé aujourd’hui</span>
    </div>
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button type="button" variant="contained" sx={{ minHeight: 44, minWidth: 0, px: 1, fontSize: 10, textTransform: 'none' }} onClick={() => setView(value => !value)} aria-expanded={view} aria-controls="daily-dashboard">{view ? 'Masquer le bilan' : 'Voir le bilan du jour'}</Button>
      <Button type="button" variant="text" sx={{ minHeight: 44, minWidth: 0, px: 1, fontSize: 10, textTransform: 'none' }} disabled={teamBusy || cloudStatus !== 'saved'} onClick={() => setConfirm(true)}>Réinitialiser aujourd’hui</Button>
    </div>
    <DailyDashboard round={round} expanded={view} />
    <ConfirmDialog open={confirm} title="Réinitialiser le point du jour ?" description="Le bilan et les humeurs d’aujourd’hui seront supprimés pour toute l’équipe, sur tous les appareils. Les équipes, participants et bilans des jours précédents sont conservés. Vous pourrez refaire le point avec le même baromètre du jour." confirmLabel="Réinitialiser aujourd’hui" danger onConfirm={() => void reset()} onClose={() => setConfirm(false)} />
  </Paper>;
}