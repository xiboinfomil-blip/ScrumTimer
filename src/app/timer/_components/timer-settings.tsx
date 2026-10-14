'use client';

import { useEffect, useState, type FormEvent } from 'react';
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
    <form className="timer-settings col-span-full grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-t border-line pt-2 text-[11px] text-muted" noValidate onSubmit={applyDuration}>
      <div className="col-span-full flex min-w-0 items-center justify-between gap-2">
        <label className="min-w-0 text-left" htmlFor="duration-minutes">Durée</label>
        <div className="flex shrink-0 items-center gap-1">
          <input className={`${field} h-11 w-11 px-1! py-1! text-center text-xs`} type="number" id="duration-minutes" min={0} max={60} step={1} required value={minutes} onChange={event => setMinutes(event.target.value)} aria-label="Minutes" />
          <span aria-hidden="true">m</span>
          <input className={`${field} h-11 w-11 px-1! py-1! text-center text-xs`} type="number" id="duration-seconds" min={0} max={59} step={1} required value={seconds} onChange={event => setSeconds(event.target.value)} aria-label="Secondes" />
          <span aria-hidden="true">s</span>
          <button type="submit" id="apply-duration" className="min-h-11 rounded-lg px-1 text-[11px] font-semibold text-brand hover:bg-blue-50">Valider</button>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <label className="shrink-0" htmlFor="warning-seconds">Alerte</label>
        <select className={`${field} h-11 flex-1 px-1! py-1! text-[11px]`} id="warning-seconds" value={timer.warning} onChange={event => timer.setWarning(Number(event.target.value))}>
          <option value={10}>10 s avant</option>
          <option value={15}>15 s avant</option>
          <option value={30}>30 s avant</option>
          <option value={60}>60 s avant</option>
          <option value={0}>Sans préalerte</option>
        </select>
      </div>
      <button type="button" id="add-time-button" className="min-h-11 rounded-lg border border-line px-2 text-[11px] font-semibold text-brand hover:bg-blue-50" title="Ajouter 30 secondes à ce passage" onClick={timer.addTime}>+30 s</button>
    </form>
  );
}