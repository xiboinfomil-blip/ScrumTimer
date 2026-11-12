'use client';

import { Button, Dialog, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PauseCircleOutlineRounded from '@mui/icons-material/PauseCircleOutlineRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import { secondaryButton } from '@/components/ui/styles';
import { TimerSettings } from './timer-settings';
import type { StandupTimer } from './timer-page';
import { TimerIcon } from './timer-icon';

export function TimerManagementDialog({ timer }: { timer: StandupTimer }) {
  return <Dialog open={timer.managing} onClose={timer.closeManage} aria-labelledby="timer-management-title" maxWidth={false} slotProps={{ paper: { id: 'timer-management-dialog', className: 'text-ink', sx: { display: 'flex', flexDirection: 'column', m: 1.5, width: 'calc(100% - 24px)', maxWidth: 520, maxHeight: 'calc(100dvh - 24px)', p: 0, overflow: 'hidden', border: '1px solid #dce3e9', borderRadius: '8px' } } }}>
    <header className="flex shrink-0 items-center justify-between gap-3 border-t-2 border-t-accent border-b border-line bg-[#f4f8fc] px-5 py-3 max-[650px]:px-4">
      <div className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg border border-brand/15 bg-white text-brand"><TimerIcon name="timer" className="size-5" /></span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase text-muted">RÉGLAGES DU PASSAGE</p><h2 id="timer-management-title" className="mt-0.5 text-xl font-bold leading-tight max-[650px]:text-lg">Modifier le minuteur</h2></div></div>
      <IconButton size="small" sx={{ width: 44, height: 44 }} type="button" className="grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-slate-50" aria-label="Fermer les réglages" onClick={timer.closeManage}><CloseIcon aria-hidden="true" sx={{ fontSize: 20 }} /></IconButton>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 max-[650px]:px-4 max-[650px]:py-4">
      <div className="mb-5 flex min-w-0 items-center justify-between gap-3 border-b border-line pb-4"><div className="min-w-0"><p className="text-[11px] text-muted">Intervenant actuel</p><p className="mt-1 break-words text-sm font-bold text-ink">{timer.person?.name ?? 'Aucun passage actif'}</p></div><span className="flex shrink-0 items-center gap-1.5 rounded border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-amber-900"><PauseCircleOutlineRounded sx={{ fontSize: 16 }} />En pause</span></div>
      {timer.managing && <TimerSettings timer={timer} />}
    </div>
    <div className="flex shrink-0 justify-between gap-2 border-t border-line bg-[#f4f8fc] px-4 py-3"><Button disableElevation size="small" variant="outlined" startIcon={<RestartAltRounded />} sx={{ minHeight: 44, textTransform: 'none', fontSize: 12 }} type="button" className={secondaryButton} onClick={timer.reset}>Réinitialiser</Button><Button disableElevation size="small" variant="contained" startIcon={<CheckRounded />} sx={{ minHeight: 44, textTransform: 'none', fontSize: 12 }} type="button" onClick={timer.closeManage}>Terminé</Button></div>
  </Dialog>;
}