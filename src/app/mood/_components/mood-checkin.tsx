'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useRef } from 'react';
import { PaginatedList } from '@/components/ui/paginated-list';
import { useTeam } from '@/providers/team-provider';
import { useNotify } from '@/providers/notification-provider';
import { canStartSession } from '@/lib/team/team-storage';
import type { Mood } from '@/types/team';
import { MoodIcon } from './mood-icon';

const moodChoices: { value: Mood; description: string; tone: string }[] = [
  { value: 1, description: 'Mauvaise humeur, énergie élevée', tone: 'border-red-300 bg-red-100 text-red-950 hover:bg-red-200 aria-pressed:border-red-800 aria-pressed:bg-red-700 aria-pressed:text-white' },
  { value: 2, description: 'Mauvaise humeur, énergie basse', tone: 'border-yellow-500 bg-yellow-200 text-yellow-950 hover:bg-yellow-300 aria-pressed:border-yellow-700 aria-pressed:bg-yellow-400 aria-pressed:text-yellow-950' },
  { value: 3, description: 'Bonne humeur, énergie basse', tone: 'border-blue-300 bg-blue-100 text-blue-950 hover:bg-blue-200 aria-pressed:border-blue-800 aria-pressed:bg-blue-700 aria-pressed:text-white' },
  { value: 4, description: 'Bonne humeur, énergie élevée', tone: 'border-green-300 bg-green-100 text-green-950 hover:bg-green-200 aria-pressed:border-green-800 aria-pressed:bg-green-700 aria-pressed:text-white' },
];

export function MoodCheckin({ className = '' }: { className?: string }) {
  const { state, updateTeam, dailyReady, participantOrder, getTimerCheckpoint, rejoinLateParticipant, activeTeamId } = useTeam();
  const params = useSearchParams();
  const checkpoint = params.get('resume') === 'timer' ? getTimerCheckpoint() : null;
  const resuming = Boolean(checkpoint);
  const router = useRouter();
  const notify = useNotify();
  const heading = useRef<HTMLHeadingElement>(null);
  const present = state.roster.filter(person => person.present).sort((a, b) => {
    const rank = (id: string) => participantOrder.includes(id) ? participantOrder.indexOf(id) : participantOrder.length;
    return rank(a.id) - rank(b.id);
  });
  const displayed = resuming ? present.filter(person => checkpoint!.timer.people.some(candidate => candidate.id === person.id && !candidate.done && candidate.postponed)) : present;
  const checked = present.filter(person => person.mood).length;
  const postponed = present.filter(person => state.postponed?.includes(person.id)).length;
  function start() {
    if (resuming) { router.push(`/timer?team=${activeTeamId}`); return; }
    if (!dailyReady || !canStartSession(state)) return;
    if (updateTeam(current => ({ ...current, session: present.map(person => person.id) }))) router.push('/timer');
  }
  return (
    <section className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-white ${className}`} aria-labelledby="mood-team-title">
      <div className="shrink-0 border-b border-line px-4 py-3 max-[650px]:px-3">
        <div className="flex min-h-8 items-center justify-between gap-2">
          <h2 ref={heading} tabIndex={-1} id="mood-team-title" className="min-w-0 rounded text-lg font-bold tracking-tight max-[650px]:text-base">Humeurs de l’équipe</h2>
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold tabular-nums ${checked === present.length ? 'bg-success-soft text-success' : 'bg-blue-50 text-brand'}`} aria-live="polite" aria-label={`${checked} humeurs sur ${present.length} personnes présentes`}><MoodIcon name={checked === present.length ? 'check' : 'clock'} className="size-3.5" />{checked} / {present.length}</span>
        </div>
        {resuming && <p className="mt-1 text-xs leading-relaxed text-muted">Tour conservé · Personnes reportées uniquement.</p>}
        <div className="mt-2 grid h-1 grid-flow-col gap-1 overflow-hidden rounded-full" aria-hidden="true">{present.map(person => <span key={person.id} className={`rounded-full ${person.mood ? 'bg-success' : state.postponed?.includes(person.id) ? 'bg-accent' : 'bg-slate-100'}`} />)}</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-2 [&_.checkin-list]:gap-2 [&_.checkin-list]:py-0 [&_.paginated-list]:@container max-[650px]:px-2">
      <PaginatedList className="checkin-list" items={displayed} renderItem={person => (
        <li key={person.id} className={`checkin-person flex h-25 shrink-0 flex-wrap content-center items-center gap-x-1 gap-y-1 rounded-md border-b px-2 @max-[340px]:h-36 motion-safe:animate-enter ${state.postponed?.includes(person.id) ? 'border-amber-200 bg-amber-50/40' : person.mood ? 'border-success/20 bg-success-soft/30' : 'border-line bg-white hover:bg-slate-50'}`}>
          <strong className="flex min-w-0 basis-full items-center gap-2 text-sm font-semibold" title={person.name}><span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${state.postponed?.includes(person.id) ? 'bg-amber-100 text-amber-800' : person.mood ? 'bg-success-soft text-success' : 'bg-blue-50 text-brand'}`}>{person.mood ? <MoodIcon name="check" className="size-3.5" /> : Array.from(person.name)[0]?.toLocaleUpperCase('fr-FR')}</span><span className="min-w-0 flex-1 truncate">{person.name}</span><span className="shrink-0 text-[10px] font-medium text-muted">{state.postponed?.includes(person.id) ? 'En attente' : person.mood ? `Humeur ${person.mood}` : 'À vous'}</span></strong>
          <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`Humeur de ${person.name} : choisissez de 1 à 4`}>
            {moodChoices.map(choice => (
              <Fragment key={choice.value}>
              <button type="button" className={`relative grid size-11 shrink-0 place-items-center rounded-md border text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink aria-pressed:ring-2 aria-pressed:ring-brand/15 aria-pressed:ring-offset-1 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-45 ${choice.tone}`}
                disabled={!dailyReady} aria-label={`Humeur ${choice.value} pour ${person.name}`} aria-describedby={`mood-choice-${person.id}-${choice.value}`} aria-pressed={person.mood === choice.value}
                onClick={() => { if (resuming) { if (rejoinLateParticipant(person.id, choice.value)) notify(`${person.name} rejoint la fin du tour. Son humeur est enregistrée.`); return; } const timestamp = new Date().toISOString(); if (updateTeam(current => ({ ...current, session: [], postponed: current.postponed?.filter(id => id !== person.id), usedMoodMeters: [...new Set([...(current.usedMoodMeters ?? []), ...(current.currentMoodSlide?.meterId ? [current.currentMoodSlide.meterId] : [])])], roster: current.roster.map(p => p.id === person.id ? { ...p, mood: choice.value, moodUpdatedAt: timestamp, moodSlide: current.currentMoodSlide ?? null } : p) }))) notify(`${person.name} : humeur ${choice.value} enregistrée.`); }}>
                {choice.value}
              </button>
              <span id={`mood-choice-${person.id}-${choice.value}`} className="sr-only">{choice.description}</span>
              </Fragment>
            ))}
          </div>
          {!resuming && <button type="button" className="ml-auto min-h-11 shrink-0 rounded-xl px-1.5 text-[11px] font-semibold text-muted hover:bg-slate-100 aria-pressed:bg-amber-50 aria-pressed:text-amber-800 disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Reporter l’humeur et le passage de ${person.name}`} aria-pressed={state.postponed?.includes(person.id) ?? false} disabled={!dailyReady} onClick={() => updateTeam(current => ({ ...current, session: [], postponed: current.postponed?.includes(person.id) ? current.postponed.filter(id => id !== person.id) : [...(current.postponed ?? []), person.id] }))}>{state.postponed?.includes(person.id) ? <>En attente <MoodIcon name="check" className="inline-block size-3.5" /></> : 'Plus tard'}</button>}
        </li>
      )} />
      </div>
      <div className="shrink-0 border-t border-line bg-slate-50/50 p-3">
        <p className={`mb-2 text-xs leading-snug ${canStartSession(state) && dailyReady ? 'text-success' : 'text-muted'}`} role="status">{canStartSession(state) ? <><MoodIcon name="check" className="inline-block size-3.5" /> Le tour peut commencer.</> : 'Choisissez 1 à 4 ou « Plus tard ». Une personne au moins doit être prête.'}{postponed > 0 ? ` ${postponed} personne(s) en attente : humeur et passage possibles depuis le minuteur.` : ''}</p>
        <button type="button" className="group inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50" disabled={!dailyReady || !canStartSession(state)} onClick={start}>{resuming ? 'Reprendre le tour en cours' : 'Continuer vers le minuteur'} <MoodIcon name="arrow" className="size-4 shrink-0 motion-safe:transition-transform motion-safe:group-hover:translate-x-1" /></button>
      </div>
    </section>
  );
}