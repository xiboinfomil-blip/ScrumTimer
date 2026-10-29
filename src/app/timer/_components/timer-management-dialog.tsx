'use client';

import { Button, Dialog, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { secondaryButton } from '@/components/ui/styles';
import { TimerSettings } from './timer-settings';
import type { StandupTimer } from './timer-page';
import { PostponedPeople } from './postponed-people';
import { TimerIcon } from './timer-icon';

export function TimerManagementDialog({ timer }: { timer: StandupTimer }) {
  return <Dialog open={timer.managing} onClose={timer.closeManage} aria-labelledby="timer-management-title" maxWidth={false} slotProps={{ paper: { id: 'timer-management-dialog', className: 'text-ink', sx: { display: 'flex', flexDirection: 'column', m: 2, width: 'calc(100% - 32px)', maxWidth: 440, maxHeight: 'calc(100dvh - 32px)', p: 0, border: '1px solid #dce3e9', borderRadius: '14px' } } }}>
    <header className="flex shrink-0 items-center justify-between gap-3 border-t-2 border-t-accent border-b border-line px-4 py-3">
      <div className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-brand"><TimerIcon name="timer" className="size-5" /></span><div className="min-w-0"><p className="text-[10px] font-bold uppercase text-muted">RÉGLAGES DU TOUR</p><h2 id="timer-management-title" className="mt-0.5 text-base font-bold">Modifier le minuteur</h2></div></div>
      <IconButton size="small" sx={{ width: 44, height: 44 }} type="button" className="grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-slate-50" aria-label="Fermer les réglages" onClick={timer.closeManage}><CloseIcon aria-hidden="true" sx={{ fontSize: 20 }} /></IconButton>
    </header>
    <p className="mx-4 mt-3 shrink-0 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">Le décompte est en pause. Vos modifications ne le relanceront pas.</p>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
      {timer.managing && <TimerSettings timer={timer} />}
      <PostponedPeople timer={timer} />
    </div>
    <div className="flex shrink-0 justify-between gap-2 border-t border-line px-4 py-3"><Button disableElevation size="small" variant="outlined" sx={{ minHeight: 44, textTransform: 'none' }} type="button" className={secondaryButton} onClick={timer.reset}>Réinitialiser</Button><Button disableElevation size="small" variant="contained" sx={{ minHeight: 44, textTransform: 'none' }} type="button" onClick={timer.closeManage}>Terminé</Button></div>
  </Dialog>;
}