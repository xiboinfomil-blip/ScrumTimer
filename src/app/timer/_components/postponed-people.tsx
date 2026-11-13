'use client';
import { cn } from 'cn';


import { Button } from '@/components/ui/button';
import { secondaryButton } from '@/components/ui/styles';
import type { StandupTimer } from './timer-page';

export function PostponedPeople({ timer }: { timer: StandupTimer }) {
  const people = timer.people.filter(p => p.postponed && !p.done);
  if (!people.length) return null;
  return <section aria-label="Personnes en attente" className={cn("bg-[transparent]", "shrink-0 border-t border-line pt-2")}>
    <h3 className="text-xs font-semibold">En attente · {people.length}</h3>
    <p className="mt-1 text-[10px] text-muted">Toujours présentes. Retrouvez le même baromètre pour leur humeur, sans perdre le tour en cours.</p>
    <div className="max-h-40 overflow-y-auto">
      {people.map(person => <div key={person.id} className="border-b border-line py-1">
        <p className="truncate text-xs font-medium" title={person.name}>{person.name}</p>
      </div>)}
    </div>
    <Button className={cn("min-h-[44px]", `${secondaryButton} w-full`)} onClick={timer.openLateCheckin} variant="outline">Renseigner les humeurs</Button>
  </section>;
}