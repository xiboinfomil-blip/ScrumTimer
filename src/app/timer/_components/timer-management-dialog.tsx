'use client';

import { useEffect, useRef } from 'react';
import { secondaryButton } from '@/components/ui/styles';
import { TimerSettings } from './timer-settings';
import type { StandupTimer } from './timer-page';

export function TimerManagementDialog({ timer }: { timer: StandupTimer }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (timer.managing && !ref.current?.open) ref.current?.showModal();
    if (!timer.managing && ref.current?.open) ref.current.close();
  }, [timer.managing]);
  return <dialog ref={ref} id="timer-management-dialog" aria-labelledby="timer-management-title" onCancel={timer.closeManage} onClose={timer.closeManage} className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-100 overflow-y-auto rounded-xl border border-line bg-white p-4 text-ink shadow-xl backdrop:bg-ink/40">
    <div className="flex items-center justify-between gap-2"><h2 id="timer-management-title" className="text-base font-semibold">Modifier le minuteur</h2><button type="button" className="grid size-11 place-items-center rounded-lg text-muted hover:bg-slate-50" aria-label="Fermer les réglages" onClick={timer.closeManage}>✕</button></div>
    <p className="mb-3 text-xs text-muted">Décompte en pause. Les modifications ne relancent pas le minuteur.</p>
    {timer.managing && <TimerSettings timer={timer} />}
    <div className="mt-3 flex justify-between gap-2"><button type="button" className={secondaryButton} onClick={timer.reset}>Réinitialiser</button><button type="button" className={secondaryButton} onClick={timer.closeManage}>Terminé</button></div>
  </dialog>;
}