'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, InputBase, NativeSelect } from '@mui/material';
import { useNotify } from '@/providers/notification-provider';
import { field } from '@/components/ui/styles';
import type { StandupTimer } from './timer-page';

export function TimerSettings({ timer }: { timer: StandupTimer }) {
  const notify = useNotify();
  const [minutes, setMinutes] = useState(String(Math.floor(timer.duration / 60)));
  const [seconds, setSeconds] = useState(String(timer.duration % 60));

  useEffect(() => {
    setMinutes(String(Math.floor(timer.duration / 60)));
    setSeconds(String(timer.duration % 60));
  }, [timer.duration]);

  function applyDuration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mins = Number(minutes);
    const secs = Number(seconds);
    if (!minutes.trim() || !seconds.trim() || !Number.isInteger(mins) || !Number.isInteger(secs) || mins < 0 || mins > 60 || secs < 0 || secs > 59) {
      notify('Choisissez de 0 à 60 minutes et de 0 à 59 secondes.');
      return;
    }
    const total = mins * 60 + secs;
    if (total < 1) {
      notify('Prévoyez au moins une seconde par personne.');
      return;
    }
    timer.setDuration(total);
    notify('Durée par personne mise à jour. Le minuteur a été réinitialisé.');
  }

  return (
    <form className="timer-settings grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 rounded-lg border border-line bg-white p-3 text-xs text-muted" noValidate onSubmit={applyDuration}>
      <div className="col-span-full grid min-w-0 gap-2 border-b border-line pb-2">
        <label className="text-left text-sm font-semibold text-ink" htmlFor="duration-minutes">Durée par personne</label>
        <div className="flex min-w-0 items-center justify-between gap-1">
          <InputBase className={`${field} h-11 w-11 bg-white px-1! py-1! text-center text-xs`} sx={{ '& input': { textAlign: 'center', p: 0 } }} type="number" id="duration-minutes" inputProps={{ min: 0, max: 60, step: 1, 'aria-label': 'Minutes' }} required value={minutes} onChange={event => setMinutes(event.target.value)} />
          <span aria-hidden="true">m</span>
          <InputBase className={`${field} h-11 w-11 bg-white px-1! py-1! text-center text-xs`} sx={{ '& input': { textAlign: 'center', p: 0 } }} type="number" id="duration-seconds" inputProps={{ min: 0, max: 59, step: 1, 'aria-label': 'Secondes' }} required value={seconds} onChange={event => setSeconds(event.target.value)} />
          <span aria-hidden="true">s</span>
          <Button disableElevation size="small" variant="text" sx={{ minHeight: 44, minWidth: 0, px: .5, textTransform: 'none', fontSize: 11 }} type="submit" id="apply-duration" className="min-h-11 rounded-lg px-1 text-[11px] font-semibold text-brand hover:bg-blue-50">Valider</Button>
        </div>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-1">
        <label className="shrink-0 font-medium text-ink" htmlFor="warning-seconds">Préalerte</label>
        <NativeSelect disableUnderline inputProps={{ id: 'warning-seconds' }} sx={{ height: 44, minWidth: 0, fontSize: 11, '& select': { boxSizing: 'border-box', height: 44, pl: .5, pr: 3 } }} className={`${field} h-11 flex-1 px-1! py-1! text-[11px]`} value={timer.warning} onChange={event => timer.setWarning(Number(event.target.value))}>
          <option value={10}>10 s avant</option>
          <option value={15}>15 s avant</option>
          <option value={30}>30 s avant</option>
          <option value={60}>60 s avant</option>
          <option value={0}>Sans préalerte</option>
        </NativeSelect>
      </div>
      <Button disableElevation size="small" variant="outlined" sx={{ minHeight: 44, minWidth: 0, px: 1, textTransform: 'none', fontSize: 11 }} type="button" id="add-time-button" className="min-h-11 self-end rounded-lg border border-line px-2 text-[11px] font-semibold text-brand hover:bg-blue-50" title="Ajouter 30 secondes à ce passage" onClick={timer.addTime}>+30 s</Button>
    </form>
  );
}