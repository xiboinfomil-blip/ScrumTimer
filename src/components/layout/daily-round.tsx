'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTeam } from '@/providers/team-provider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PaginatedList } from '@/components/ui/paginated-list';
import { card, primaryButton, secondaryButton } from '@/components/ui/styles';
import { formatTime } from '@/lib/timer';

/** Available on every device, even after the transient timer/session is gone. */
export function DailyRound() {
  const { todayRound: round, activeTeamName, resetToday, teamBusy, cloudStatus } = useTeam();
  const router = useRouter();
  const [view, setView] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (!round) return null;
  const people = [...round.people].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const reset = async () => {
    setConfirm(false);
    if (await resetToday()) router.replace('/participants');
  };
  return <section className={`${card} mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 p-4`} aria-label="Point quotidien du jour">
    <div className="shrink-0">
      <p className="text-xs font-semibold text-success">Point quotidien terminé aujourd’hui</p>
      <h1 className="mt-1 text-xl font-bold">{activeTeamName}</h1>
      <p className="mt-2 text-sm text-muted">Un seul point quotidien par équipe et par jour. Le bilan est disponible sur tous les appareils.</p>
      <p className="mt-1 text-xs text-muted">{new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Mauritius', dateStyle: 'long', timeStyle: 'short' }).format(new Date(round.completedAt))} · {people.length} participants</p>
    </div>
    <div className="flex shrink-0 flex-wrap gap-2">
      <button type="button" className={primaryButton} onClick={() => setView(value => !value)} aria-expanded={view}>{view ? 'Masquer le bilan' : 'Voir le bilan du jour'}</button>
      <button type="button" className={secondaryButton} disabled={teamBusy || cloudStatus !== 'saved'} onClick={() => setConfirm(true)}>Réinitialiser aujourd’hui</button>
    </div>
    {view && <>
      <h2 className="shrink-0 border-b border-line pb-2 text-sm font-semibold">Bilan enregistré · Classement</h2>
      <PaginatedList items={people} ordered renderItem={person => <li key={person.id} className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-2">
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{person.name}</p><p className="text-xs text-muted">{formatTime(person.speakingSeconds)} · Humeur {person.mood ?? '—'}{person.meterTitle ? ` · ${person.meterTitle}` : ''}</p></div>
        <strong className="shrink-0 text-sm text-brand">{person.score ?? '—'} pts</strong>
      </li>} />
    </>}
    <ConfirmDialog open={confirm} title="Réinitialiser le point du jour ?" description="Le bilan et les humeurs d’aujourd’hui seront supprimés pour toute l’équipe, sur tous les appareils. Les équipes, participants et bilans des jours précédents sont conservés. Vous pourrez refaire le point avec le même baromètre du jour." confirmLabel="Réinitialiser aujourd’hui" danger onConfirm={() => void reset()} onClose={() => setConfirm(false)} />
  </section>;
}