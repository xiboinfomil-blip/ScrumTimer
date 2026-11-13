'use client';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from 'cn';


import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { Button as IconButton } from '@/components/ui/button';
import { X as CloseIcon } from 'lucide-react';
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
  return <Dialog open={true} onOpenChange={next => { if (!next) (close)?.(); }}><DialogContent showCloseButton={false} className="min-h-0 flex h-[calc(100dvh-16px)] max-h-[calc(100dvh-16px)] w-[calc(100%-16px)] max-w-[1440px] flex-col overflow-hidden rounded-lg sm:h-[calc(100dvh-48px)] sm:max-h-[calc(100dvh-48px)] sm:w-[calc(100%-48px)]" aria-labelledby="manage-team-modal-title">
    <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-3 sm:px-5">
      <DialogTitle id="manage-team-modal-title" className={cn("shrink-0 px-5 pt-5 pb-2", "min-w-0 truncate p-0 text-sm font-semibold text-ink")}>Gestion de l’équipe <span className="font-normal text-muted">· {activeTeamName}</span></DialogTitle>
      <IconButton aria-label="Fermer la gestion de l’équipe" title="Fermer" onClick={close} className="size-11 shrink-0 rounded-lg text-muted hover:bg-slate-100" variant="ghost" size="icon"><CloseIcon /></IconButton>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4 sm:py-3"><div className="min-h-full">{children}</div></div>
  </DialogContent></Dialog>;
}