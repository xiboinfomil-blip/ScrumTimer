'use client';


import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { cn } from 'cn';



import { Button } from '@/components/ui/button';
import { MoodMeter } from '@/app/mood/_components/mood-meter';
import { PaginatedList } from '@/components/ui/paginated-list';
import { useTeam } from '@/providers/team-provider';
import type { Mood } from '@/types/team';
import type { StandupTimer } from './timer-page';

export function LateCheckinDialog({ timer, autoOpen = false }: { timer: StandupTimer; autoOpen?: boolean }) {
  const { dailyReady, cloudStatus } = useTeam();
  const people = timer.people.filter(person => person.postponed && !person.done);
  const open = timer.lateChecking || autoOpen;
  return <Dialog open={open} onOpenChange={next => { if (!next) (autoOpen ? undefined : timer.closeLateCheckin)?.(); }}><DialogContent showCloseButton={false} className="min-h-0 w-[calc(100%_-_16px)] max-w-[1200px] h-[min(820px,_calc(100dvh_-_16px))] border-[1px_solid_#dce3e9] rounded-[14px]" aria-labelledby="late-checkin-title" aria-describedby="late-checkin-description">
    <DialogTitle id="late-checkin-title" className={cn("shrink-0 px-5 pt-5 pb-2", "border-t-2 border-t-accent pb-2! text-lg! font-bold!")}>Un instant pour votre humeur</DialogTitle>
    <DialogDescription id="late-checkin-description" className="shrink-0 px-6 pb-3 text-xs text-muted [@media(max-height:650px)]:sr-only">Le même baromètre, le même tour. Le minuteur est en pause et tous les passages sont conservés.</DialogDescription>
    <div className={cn("min-h-0 overflow-y-auto px-5 py-3", "flex min-h-0 flex-1 flex-col px-3! py-0! sm:px-5!")}>
      {open && <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.5fr)_minmax(280px,.8fr)] gap-3 max-[800px]:grid-cols-1 max-[800px]:grid-rows-[minmax(0,1fr)_auto]">
        <MoodMeter locked className="[&_[id=meter-slide-stack]]:auto-rows-[minmax(44px,1fr)]" />
        <section className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-white p-3 ${people.length > 1 ? 'max-[800px]:h-48' : 'max-[800px]:h-40'} [@media(max-height:650px)]:p-2 [&_.list-pagination.invisible]:hidden [&_.late-checkin-list]:mt-1 [&_.late-checkin-list]:p-0`} aria-label="Humeurs des personnes reportées">
          <h2 className="shrink-0 text-sm font-bold">Rejoindre le tour · {people.length}</h2>
          {people.length ? <PaginatedList className="late-checkin-list" items={people} renderItem={person => <li key={person.id} className="flex h-24 shrink-0 flex-col justify-center gap-2 rounded-xl border border-line bg-white px-3">
            <strong className="truncate text-sm" title={person.name}>{person.name}</strong>
            {person.mood ? <Button onClick={() => timer.rejoin(person.id)} disabled={!dailyReady || cloudStatus !== 'saved'} aria-label={`Faire rejoindre ${person.name}`} variant="ghost" className="min-h-[44px] justify-start normal-case">Rejoindre le tour · Humeur {person.mood}</Button> : <div className="flex gap-2" role="group" aria-label={`Humeur de ${person.name} : choisissez de 1 à 4`}>
              {([1, 2, 3, 4] as Mood[]).map(mood => <Button key={mood} type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-white text-sm font-bold text-brand hover:border-brand hover:bg-blue-50 disabled:opacity-40" disabled={!dailyReady || cloudStatus !== 'saved'} aria-label={`Humeur ${mood} pour ${person.name}`} onClick={() => timer.rejoin(person.id, mood)} variant="ghost">{mood}</Button>)}
            </div>}
          </li>} /> : <p role="status" className="my-auto py-3 text-sm text-success">Toutes les personnes ont rejoint le tour. Reprenez lorsque vous êtes prêt.</p>}
        </section>
      </div>}
    </div>
    <DialogFooter>{autoOpen ? <Button onClick={timer.finishWithoutPostponed} disabled={!timer.people.some(person => person.done && !person.postponed)} variant="ghost" className="min-h-[44px]">Terminer sans les personnes en attente</Button> : <Button onClick={timer.closeLateCheckin} variant="ghost" className="min-h-[44px]">Revenir au tour</Button>}</DialogFooter>
  </DialogContent></Dialog>;
}