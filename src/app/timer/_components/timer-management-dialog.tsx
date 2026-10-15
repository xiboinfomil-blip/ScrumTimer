'use client';

import { Button, Dialog, IconButton } from '@mui/material';
import { secondaryButton } from '@/components/ui/styles';
import { TimerSettings } from './timer-settings';
import type { StandupTimer } from './timer-page';
import { PostponedPeople } from './postponed-people';

export function TimerManagementDialog({ timer }: { timer: StandupTimer }) {
  return <Dialog open={timer.managing} onClose={timer.closeManage} aria-labelledby="timer-management-title" maxWidth={false} slotProps={{ paper: { id: 'timer-management-dialog', className: 'text-ink', sx: { m: 2, width: 'calc(100% - 32px)', maxWidth: 400, maxHeight: 'calc(100dvh - 32px)', p: 2, borderRadius: '16px' } } }}>
    <div className="flex items-center justify-between gap-2"><h2 id="timer-management-title" className="text-base font-semibold">Modifier le minuteur</h2><IconButton size="small" sx={{ width: 44, height: 44 }} type="button" className="grid size-11 place-items-center rounded-lg text-muted hover:bg-slate-50" aria-label="Fermer les réglages" onClick={timer.closeManage}>✕</IconButton></div>
    <p className="mb-3 text-xs text-muted">Décompte en pause. Les modifications ne relancent pas le minuteur.</p>
    {timer.managing && <TimerSettings timer={timer} />}
    <PostponedPeople timer={timer} />
    <div className="mt-3 flex justify-between gap-2"><Button disableElevation size="small" variant="outlined" sx={{ minHeight: 44, textTransform: 'none' }} type="button" className={secondaryButton} onClick={timer.reset}>Réinitialiser</Button><Button disableElevation size="small" variant="contained" sx={{ minHeight: 44, textTransform: 'none' }} type="button" className={secondaryButton} onClick={timer.closeManage}>Terminé</Button></div>
  </Dialog>;
}