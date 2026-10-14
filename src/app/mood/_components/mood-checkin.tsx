'use client';

import { useRouter } from 'next/navigation';
import { PaginatedList } from '@/components/ui/paginated-list';
import { card, primaryButton } from '@/components/ui/styles';
import { useTeam } from '@/providers/team-provider';
import { useNotify } from '@/providers/notification-provider';
import { canStartSession } from '@/lib/team-storage';
import { shuffle } from '@/lib/shuffle';
import type { Mood } from '@/types/team';

export function MoodCheckin({ className = '' }: { className?: string }) {
  const { state, updateTeam, dailyReady } = useTeam();
  const router = useRouter();
  const notify = useNotify();
  const present = state.roster.filter(person => person.present);
  const checked = present.filter(person => person.mood).length;
  const postponed = present.filter(person => state.postponed?.includes(person.id)).length;
  function start() {
    if (!dailyReady || !canStartSession(state)) return;
    const ids = present.map(person => person.id);
    const same = state.session.length === ids.length && ids.every(id => state.session.includes(id));
    const session = shuffle(same ? state.session : ids, true);
    if (!updateTeam(current => ({ ...current, session }))) return;
    router.push('/timer');
  }
  return (
    <section className={`${card} flex min-h-0 min-w-0 flex-1 flex-col gap-2 rounded-2xl p-3 [&>.list-pagination]:h-11 [&>.list-pagination>button]:size-11 ${className}`} aria-labelledby="mood-team-title">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line">
        <h2 id="mood-team-title" className="min-w-0 text-sm font-semibold">Le ressenti de votre équipe</h2>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${checked === present.length ? 'bg-success-soft text-success' : 'bg-orange-50 text-amber-800'}`} aria-live="polite">{checked === present.length ? '✓ ' : ''}{checked} / {present.length}</span>
      </div>
      <PaginatedList className="checkin-list" items={present} renderItem={person => (
        <li key={person.id} className={`checkin-person flex h-14 shrink-0 items-center gap-2 rounded-lg border-b border-l-2 px-1 motion-safe:animate-enter max-[1100px]:h-22 max-[1100px]:flex-wrap max-[1100px]:content-center max-[1100px]:gap-y-1 ${person.mood ? 'border-l-success border-b-green-100 bg-success-soft/50' : 'border-l-accent border-b-line/70'}`}>
          <strong className="min-w-0 flex-1 truncate text-[13px] font-medium max-[1100px]:basis-full" title={person.name}>{person.name}</strong>
          <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`Humeur de ${person.name} : choisissez de 1 à 4`}>
            {([1, 2, 3, 4] as Mood[]).map(mood => (
              <button key={mood} className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-white text-sm font-semibold text-brand shadow-[0_1px_2px_#19375204] transition-colors hover:border-accent hover:bg-orange-50 aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-white aria-pressed:shadow-[0_3px_8px_#205f9d20] motion-reduce:transition-none"
                disabled={!dailyReady} aria-label={`Humeur ${mood} pour ${person.name}`} aria-pressed={person.mood === mood}
                onClick={() => { const timestamp = new Date().toISOString(); if (updateTeam(current => ({ ...current, session: [], postponed: current.postponed?.filter(id => id !== person.id), usedMoodMeters: [...new Set([...(current.usedMoodMeters ?? []), ...(current.currentMoodSlide?.meterId ? [current.currentMoodSlide.meterId] : [])])], roster: current.roster.map(p => p.id === person.id ? { ...p, mood, moodUpdatedAt: timestamp, moodSlide: current.currentMoodSlide ?? null } : p) }))) notify(`${person.name} : humeur ${mood} enregistrée.`); }}>
                {mood}
              </button>
            ))}
          </div>
          <button type="button" className="min-h-11 shrink-0 rounded-lg px-2 text-[11px] text-brand hover:bg-blue-50" aria-label={`Reporter l’humeur et le passage de ${person.name}`} aria-pressed={state.postponed?.includes(person.id) ?? false} disabled={!dailyReady} onClick={() => updateTeam(current => ({ ...current, session: [], postponed: current.postponed?.includes(person.id) ? current.postponed.filter(id => id !== person.id) : [...(current.postponed ?? []), person.id] }))}>{state.postponed?.includes(person.id) ? 'En attente ✓' : 'Plus tard'}</button>
        </li>
      )} />
      <div className="shrink-0 border-t border-line pt-2">
        <p className="mb-2 text-[11px] text-muted">{canStartSession(state) ? '✓ Le tour peut commencer.' : 'Renseignez les humeurs ou choisissez « Plus tard ». Au moins une personne doit être prête.'}{postponed > 0 ? ` ${postponed} personne(s) en attente : humeur et passage possibles depuis le minuteur.` : ''}</p>
        <button className={`${primaryButton} min-h-11 w-full justify-between`} disabled={!dailyReady || !canStartSession(state)} onClick={start}>Continuer vers le minuteur <span aria-hidden="true">→</span></button>
      </div>
    </section>
  );
}