'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Paper } from '@mui/material';
import { useTeam } from '@/providers/team-provider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { RoundFeedback } from '@/components/ui/round-feedback';
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
  return <Paper component="section" variant="outlined" className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-2 overflow-hidden rounded-2xl! border-slate-200! p-2 sm:p-3" aria-label="Point quotidien du jour">
    <div className="flex shrink-0 items-center justify-between gap-2">
      <div className="min-w-0 border-l-[3px] border-accent pl-2.5"><h1 className="truncate text-lg font-bold tracking-tight text-brand max-[400px]:text-base" title={activeTeamName}>Bilan du jour · {activeTeamName}</h1><p className="text-[11px] text-muted [@media(max-height:650px)]:hidden">{new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Mauritius', day: 'numeric', month: 'short' }).format(new Date(round.completedAt))} · {round.people.length} participants</p></div>
      <span className="shrink-0 rounded-full bg-success-soft px-2 py-1 text-[10px] font-semibold text-success" title="Point quotidien terminé aujourd’hui">✓ Terminé</span><span className="sr-only">Point quotidien terminé aujourd’hui</span>
    </div>
    <div className="flex shrink-0 items-center gap-1 [&>button]:rounded-xl [&>button]:whitespace-nowrap [&>button]:text-[11px]">
      <Button type="button" variant="contained" aria-label={view ? 'Masquer le bilan' : 'Voir le bilan du jour'} sx={{ minHeight: 44, minWidth: 0, px: 1, fontSize: 11, textTransform: 'none', boxShadow: 'none' }} onClick={() => setView(value => !value)} aria-expanded={view} aria-controls="daily-dashboard"><span className="max-[650px]:hidden">{view ? 'Masquer le bilan' : 'Voir le bilan du jour'}</span><span className="min-[650px]:hidden">{view ? 'Masquer' : 'Voir le bilan'}</span></Button>
      <Button type="button" variant="text" aria-label="Réinitialiser aujourd’hui" sx={{ minHeight: 44, minWidth: 0, px: 1, fontSize: 11, textTransform: 'none' }} disabled={teamBusy || cloudStatus !== 'saved'} onClick={() => setConfirm(true)}><span className="max-[650px]:hidden">Réinitialiser aujourd’hui</span><span className="min-[650px]:hidden">Réinitialiser</span></Button>
      <RoundFeedback round={round} />
    </div>
    <DailyDashboard round={round} expanded={view} />
    <ConfirmDialog open={confirm} title="Réinitialiser le point du jour ?" description="Le bilan, ses retours d’utilité et les humeurs d’aujourd’hui seront supprimés pour toute l’équipe, sur tous les appareils. Les équipes, participants et bilans des jours précédents sont conservés. Vous pourrez refaire le point avec le même baromètre du jour." confirmLabel="Réinitialiser aujourd’hui" danger onConfirm={() => void reset()} onClose={() => setConfirm(false)} />
  </Paper>;
}