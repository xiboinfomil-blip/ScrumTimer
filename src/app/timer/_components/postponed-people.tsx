'use client';

import { useTeam } from '@/providers/team-provider';
import { secondaryButton } from '@/components/ui/styles';
import type { Mood } from '@/types/team';
import type { StandupTimer } from './timer-page';

export function PostponedPeople({ timer }: { timer: StandupTimer }) {
  const { dailyReady } = useTeam();
  const people = timer.people.filter(p => p.postponed && !p.done);
  if (!people.length) return null;
  return <section aria-label="Personnes en attente" className="shrink-0 border-t border-line pt-2">
    <h3 className="text-xs font-semibold">En attente · {people.length}</h3>
    <p className="mt-1 text-[10px] text-muted">Toujours présentes. À leur arrivée, choisissez leur humeur puis ajoutez leur passage en fin de tour.</p>
    <div className="max-h-40 overflow-y-auto">
      {people.map(person => <div key={person.id} className="border-b border-line py-1">
        <p className="truncate text-xs font-medium" title={person.name}>{person.name}</p>
        {person.mood ? <button type="button" className={`${secondaryButton} min-h-11 w-full text-xs`} onClick={() => timer.rejoin(person.id)} aria-label={`Reprendre le passage de ${person.name}`}>Rejoindre le tour</button> : <div className="flex gap-1" role="group" aria-label={`Humeur différée de ${person.name}`}>
          {([1, 2, 3, 4] as Mood[]).map(mood => <button type="button" key={mood} className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-brand hover:bg-blue-50" disabled={!dailyReady} aria-label={`Humeur ${mood} et rejoindre pour ${person.name}`} onClick={() => timer.rejoin(person.id, mood)}>{mood}</button>)}
        </div>}
      </div>)}
    </div>
  </section>;
}