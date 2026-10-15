'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Chip, Paper } from '@mui/material';
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
  return <Paper component="section" variant="outlined" className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-3 sm:p-5" aria-label="Point quotidien du jour">
    <div className="shrink-0">
      <Chip size="small" color="success" variant="outlined" label="Point quotidien terminé aujourd’hui" sx={{ maxWidth: '100%', fontSize: 12 }} />
      <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-brand">Bilan du jour</p>
      <h1 className="mt-1 text-2xl font-bold text-brand">{activeTeamName}</h1>
      <p className="mt-2 text-sm text-muted">Un seul point quotidien par équipe et par jour. Le bilan est disponible sur tous les appareils.</p>
      <p className="mt-1 text-xs text-muted">{new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Mauritius', dateStyle: 'long', timeStyle: 'short' }).format(new Date(round.completedAt))} · {round.people.length} participants · {cloudStatus === 'saved' ? 'Neon connecté' : 'Vérifiez la synchronisation Neon'}</p>
    </div>
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button type="button" variant="contained" sx={{ minHeight: 44, fontSize: 12, textTransform: 'none' }} onClick={() => setView(value => !value)} aria-expanded={view} aria-controls="daily-dashboard">{view ? 'Masquer le bilan' : 'Voir le bilan du jour'}</Button>
      <Button type="button" variant="outlined" sx={{ minHeight: 44, fontSize: 12, textTransform: 'none' }} disabled={teamBusy || cloudStatus !== 'saved'} onClick={() => setConfirm(true)}>Réinitialiser aujourd’hui</Button>
    </div>
    <div className="shrink-0"><DailyDashboard round={round} expanded={view} /></div>
    <ConfirmDialog open={confirm} title="Réinitialiser le point du jour ?" description="Le bilan et les humeurs d’aujourd’hui seront supprimés pour toute l’équipe, sur tous les appareils. Les équipes, participants et bilans des jours précédents sont conservés. Vous pourrez refaire le point avec le même baromètre du jour." confirmLabel="Réinitialiser aujourd’hui" danger onConfirm={() => void reset()} onClose={() => setConfirm(false)} />
  </Paper>;
}