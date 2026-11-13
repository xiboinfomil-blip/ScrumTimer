'use client';
import { Dialog, DialogContent } from '@/components/ui/dialog';

import { cn } from 'cn';



import { Button, Button as IconButton } from '@/components/ui/button';
import { X as CloseIcon } from 'lucide-react';
import { CirclePause as PauseCircleOutlineRounded } from 'lucide-react';
import { RotateCcw as RestartAltRounded } from 'lucide-react';
import { Check as CheckRounded } from 'lucide-react';
import { secondaryButton } from '@/components/ui/styles';
import { TimerSettings } from './timer-settings';
import type { StandupTimer } from './timer-page';
import { TimerIcon } from './timer-icon';

export function TimerManagementDialog({ timer }: { timer: StandupTimer }) {
  return <Dialog open={timer.managing} onOpenChange={next => { if (!next) (timer.closeManage)?.(); }}><DialogContent showCloseButton={false} className="min-h-0 flex flex-col w-[calc(100%_-_24px)] max-w-[520px] max-h-[calc(100dvh_-_24px)] p-[0px] overflow-hidden border-[1px_solid_#dce3e9] rounded-[8px] text-ink" aria-labelledby="timer-management-title" id={'timer-management-dialog'}>
    <header className="flex shrink-0 items-center justify-between gap-3 border-t-2 border-t-accent border-b border-line bg-[#f4f8fc] px-5 py-3 max-[650px]:px-4">
      <div className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg border border-brand/15 bg-white text-brand"><TimerIcon name="timer" className="size-5" /></span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase text-muted">RÉGLAGES DU PASSAGE</p><h2 id="timer-management-title" className="mt-0.5 text-xl font-bold leading-tight max-[650px]:text-lg">Modifier le minuteur</h2></div></div>
      <IconButton type="button" className={cn("w-[44px] h-[44px]", "grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-slate-50")} aria-label="Fermer les réglages" onClick={timer.closeManage} variant="ghost" size="icon"><CloseIcon aria-hidden="true" size={20} /></IconButton>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 max-[650px]:px-4 max-[650px]:py-4">
      <div className="mb-5 flex min-w-0 items-center justify-between gap-3 border-b border-line pb-4"><div className="min-w-0"><p className="text-[11px] text-muted">Intervenant actuel</p><p className="mt-1 break-words text-sm font-bold text-ink">{timer.person?.name ?? 'Aucun passage actif'}</p></div><span className="flex shrink-0 items-center gap-1.5 rounded border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-amber-900"><PauseCircleOutlineRounded size={16} />En pause</span></div>
      {timer.managing && <TimerSettings timer={timer} />}
    </div>
    <div className="flex shrink-0 justify-between gap-2 border-t border-line bg-[#f4f8fc] px-4 py-3"><Button type="button" className={cn("min-h-[44px] normal-case text-[12px]", secondaryButton)} onClick={timer.reset} variant="outline" size="sm"><RestartAltRounded />Réinitialiser</Button><Button type="button" onClick={timer.closeManage} variant="default" size="sm" className="min-h-[44px] normal-case text-[12px]"><CheckRounded />Terminé</Button></div>
  </DialogContent></Dialog>;
}