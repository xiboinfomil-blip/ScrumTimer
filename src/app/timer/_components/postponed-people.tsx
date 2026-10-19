'use client';

import { Button, Paper } from '@mui/material';
import { secondaryButton } from '@/components/ui/styles';
import type { StandupTimer } from './timer-page';

export function PostponedPeople({ timer }: { timer: StandupTimer }) {
  const people = timer.people.filter(p => p.postponed && !p.done);
  if (!people.length) return null;
  return <Paper component="section" elevation={0} sx={{ background: 'transparent' }} aria-label="Personnes en attente" className="shrink-0 border-t border-line pt-2">
    <h3 className="text-xs font-semibold">En attente · {people.length}</h3>
    <p className="mt-1 text-[10px] text-muted">Toujours présentes. Retrouvez le même baromètre pour leur humeur, sans perdre le tour en cours.</p>
    <div className="max-h-40 overflow-y-auto">
      {people.map(person => <div key={person.id} className="border-b border-line py-1">
        <p className="truncate text-xs font-medium" title={person.name}>{person.name}</p>
      </div>)}
    </div>
    <Button variant="outlined" className={`${secondaryButton} w-full`} sx={{ minHeight: 44 }} onClick={timer.openLateCheckin}>Retour au baromètre</Button>
  </Paper>;
}