'use client';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

import { cn } from 'cn';


import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Check as CheckRounded } from 'lucide-react';
import { AlarmClockPlus as MoreTimeRounded } from 'lucide-react';
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
    <form className="timer-settings grid min-w-0 gap-5 text-sm text-muted" noValidate onSubmit={applyDuration}>
      <fieldset className="grid min-w-0 grid-cols-2 gap-3 border-0 p-0">
        <legend className="mb-3 text-sm font-bold text-ink">Durée par personne</legend>
        <label htmlFor="duration-minutes" className="grid min-w-0 gap-1.5 text-xs font-medium">Minutes<Input className={`${field} min-h-14 w-full px-3! text-2xl! font-semibold! tabular-nums`} type="number" id="duration-minutes" required value={minutes} onChange={event => setMinutes(event.target.value)} {...{ min: 0, max: 60, step: 1, 'aria-label': 'Minutes' }} /></label>
        <label htmlFor="duration-seconds" className="grid min-w-0 gap-1.5 text-xs font-medium">Secondes<Input className={`${field} min-h-14 w-full px-3! text-2xl! font-semibold! tabular-nums`} type="number" id="duration-seconds" required value={seconds} onChange={event => setSeconds(event.target.value)} {...{ min: 0, max: 59, step: 1, 'aria-label': 'Secondes' }} /></label>
        <Button type="submit" id="apply-duration" className={cn("min-h-[44px] normal-case text-[12px]", "col-span-full")} variant="outline"><CheckRounded />Appliquer la durée</Button>
      </fieldset>
      <div className="grid min-w-0 gap-3 border-t border-line pt-5">
        <label className="font-bold text-ink" htmlFor="warning-seconds">Préalerte</label>
        <NativeSelect className={`${field} h-11 px-0! py-0!`} value={timer.warning} onChange={event => timer.setWarning(Number(event.target.value))} {...{ id: 'warning-seconds' }}>
          <option value={10}>10 s avant</option>
          <option value={15}>15 s avant</option>
          <option value={30}>30 s avant</option>
          <option value={60}>60 s avant</option>
          <option value={0}>Sans préalerte</option>
        </NativeSelect>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-line pt-4"><span className="text-xs font-semibold text-ink">Passage actuel</span><Button type="button" id="add-time-button" title="Ajouter 30 secondes à ce passage" onClick={timer.addTime} variant="ghost" className="min-h-[44px] normal-case text-[12px]"><MoreTimeRounded />+30 s</Button></div>
    </form>
  );
}