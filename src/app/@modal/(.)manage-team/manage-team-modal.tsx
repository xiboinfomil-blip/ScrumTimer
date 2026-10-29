'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogTitle, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useTeam } from '@/providers/team-provider';

export function ManageTeamModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { activeTeamId, activeTeamName } = useTeam();
  const managedTeamId = useRef(activeTeamId);
  const close = () => router.back();
  useEffect(() => {
    if (managedTeamId.current === activeTeamId) return;
    router.replace(activeTeamId ? `/teams?team=${activeTeamId}` : '/teams');
  }, [activeTeamId, router]);
  return <Dialog open onClose={close} fullWidth maxWidth={false} aria-labelledby="manage-team-modal-title" slotProps={{ paper: { className: 'm-2 flex h-[calc(100dvh-16px)] max-h-[calc(100dvh-16px)] w-[calc(100%-16px)] max-w-[1440px] flex-col overflow-hidden rounded-lg sm:m-6 sm:h-[calc(100dvh-48px)] sm:max-h-[calc(100dvh-48px)] sm:w-[calc(100%-48px)]' }, backdrop: { className: 'bg-slate-950/45' } }}>
    <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-3 sm:px-5">
      <DialogTitle id="manage-team-modal-title" className="min-w-0 truncate p-0 text-sm font-semibold text-ink">Gestion de l’équipe <span className="font-normal text-muted">· {activeTeamName}</span></DialogTitle>
      <IconButton aria-label="Fermer la gestion de l’équipe" title="Fermer" onClick={close} className="size-11 shrink-0 rounded-lg text-muted hover:bg-slate-100"><CloseIcon /></IconButton>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4 sm:py-3"><div className="min-h-full">{children}</div></div>
  </Dialog>;
}