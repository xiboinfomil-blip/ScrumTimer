'use client';

import { useRouter } from 'next/navigation';
import { Button, Paper } from '@mui/material';
import { PaginatedList } from '@/components/ui/paginated-list';
import { card, primaryButton } from '@/components/ui/styles';
import { useTeam } from '@/providers/team-provider';
import { useNotify } from '@/providers/notification-provider';
import { canStartSession } from '@/lib/team-storage';
import type { Mood } from '@/types/team';
import { MoodIcon } from './mood-icon';

export function MoodCheckin({ className = '' }: { className?: string }) {
  const { state, updateTeam, dailyReady, participantOrder } = useTeam();
  const router = useRouter();
  const notify = useNotify();
  const present = state.roster.filter(person => person.present).sort((a, b) => {
    const rank = (id: string) => participantOrder.includes(id) ? participantOrder.indexOf(id) : participantOrder.length;
    return rank(a.id) - rank(b.id);
  });
  const checked = present.filter(person => person.mood).length;
  const postponed = present.filter(person => state.postponed?.includes(person.id)).length;
  function start() {
    if (!dailyReady || !canStartSession(state)) return;
    if (updateTeam(current => ({ ...current, session: present.map(person => person.id) }))) router.push('/timer');
  }
  return (
    <Paper component="section" elevation={0} className={`${card} flex min-h-0 min-w-0 flex-1 flex-col gap-2 rounded-2xl border-slate-200/80 p-3 max-[650px]:p-2.5 ${className}`} aria-labelledby="mood-team-title">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line">
        <h2 id="mood-team-title" className="min-w-0 text-[13px] font-semibold">Le ressenti de votre équipe</h2>
        <span className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold tabular-nums ${checked === present.length ? 'bg-success-soft text-success' : 'bg-amber-50 text-amber-800'}`} aria-live="polite"><MoodIcon name={checked === present.length ? 'check' : 'clock'} className="size-3.5" />{checked} / {present.length}</span>
      </div>
      <PaginatedList className="checkin-list" items={present} renderItem={person => (
        <li key={person.id} className={`checkin-person flex h-14 shrink-0 items-center gap-1 rounded-xl border px-1 motion-safe:animate-enter max-[1100px]:h-22 max-[1100px]:flex-wrap max-[1100px]:content-center max-[1100px]:gap-y-1 ${state.postponed?.includes(person.id) ? 'border-amber-200 bg-amber-50/40' : person.mood ? 'border-success/20 bg-success-soft/40' : 'border-slate-200/80 bg-slate-50/50'}`}>
          <strong className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-semibold max-[1100px]:basis-full" title={person.name}><span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${state.postponed?.includes(person.id) ? 'bg-accent' : person.mood ? 'bg-success' : 'bg-slate-300'}`} /><span className="truncate">{person.name}</span></strong>
          <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`Humeur de ${person.name} : choisissez de 1 à 4`}>
            {([1, 2, 3, 4] as Mood[]).map(mood => (
              <Button type="button" disableElevation size="small" variant={person.mood === mood ? 'contained' : 'outlined'} sx={{ width: 44, height: 44, minWidth: 44, p: 0 }} key={mood} className="relative grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-brand transition-colors hover:border-brand/40 hover:bg-blue-50 aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-white aria-pressed:ring-2 aria-pressed:ring-brand/15 aria-pressed:ring-offset-1 disabled:opacity-45 motion-reduce:transition-none"
                disabled={!dailyReady} aria-label={`Humeur ${mood} pour ${person.name}`} aria-pressed={person.mood === mood}
                onClick={() => { const timestamp = new Date().toISOString(); if (updateTeam(current => ({ ...current, session: [], postponed: current.postponed?.filter(id => id !== person.id), usedMoodMeters: [...new Set([...(current.usedMoodMeters ?? []), ...(current.currentMoodSlide?.meterId ? [current.currentMoodSlide.meterId] : [])])], roster: current.roster.map(p => p.id === person.id ? { ...p, mood, moodUpdatedAt: timestamp, moodSlide: current.currentMoodSlide ?? null } : p) }))) notify(`${person.name} : humeur ${mood} enregistrée.`); }}>
                {mood}
              </Button>
            ))}
          </div>
          <Button disableElevation size="small" variant="text" sx={{ minHeight: 44, minWidth: 0, textTransform: 'none', fontSize: 11 }} type="button" className="min-h-11 shrink-0 rounded-lg px-2 text-[11px] text-muted hover:bg-slate-100 aria-pressed:bg-amber-50 aria-pressed:text-amber-800" aria-label={`Reporter l’humeur et le passage de ${person.name}`} aria-pressed={state.postponed?.includes(person.id) ?? false} disabled={!dailyReady} onClick={() => updateTeam(current => ({ ...current, session: [], postponed: current.postponed?.includes(person.id) ? current.postponed.filter(id => id !== person.id) : [...(current.postponed ?? []), person.id] }))}>{state.postponed?.includes(person.id) ? 'En attente ✓' : 'Plus tard'}</Button>
        </li>
      )} />
      <div className="shrink-0 border-t border-line pt-2">
        <p className={`mb-2 text-[11px] ${canStartSession(state) && dailyReady ? 'text-success' : 'text-muted'}`}>{canStartSession(state) ? '✓ Le tour peut commencer.' : 'Choisissez 1 à 4 ou « Plus tard ». Une personne au moins doit être prête.'}{postponed > 0 ? ` ${postponed} personne(s) en attente : humeur et passage possibles depuis le minuteur.` : ''}</p>
        <Button type="button" disableElevation size="small" variant="contained" sx={{ minHeight: 44, minWidth: 0, textTransform: 'none', fontSize: 12 }} className={`${primaryButton} min-h-11 w-full justify-between rounded-xl`} disabled={!dailyReady || !canStartSession(state)} onClick={start}>Continuer vers le minuteur <MoodIcon name="arrow" /></Button>
      </div>
    </Paper>
  );
}