'use client';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { MoodMeter } from '@/app/mood/_components/mood-meter';
import { PaginatedList } from '@/components/ui/paginated-list';
import { useTeam } from '@/providers/team-provider';
import type { Mood } from '@/types/team';
import type { StandupTimer } from './timer-page';

export function LateCheckinDialog({ timer }: { timer: StandupTimer }) {
  const { dailyReady, cloudStatus } = useTeam();
  const people = timer.people.filter(person => person.postponed && !person.done);
  return <Dialog open={timer.lateChecking} onClose={timer.closeLateCheckin} aria-labelledby="late-checkin-title" aria-describedby="late-checkin-description" maxWidth={false} slotProps={{ paper: { sx: { m: 1, width: 'calc(100% - 16px)', maxWidth: 1200, height: 'min(820px, calc(100dvh - 16px))', borderRadius: '24px' } } }}>
    <DialogTitle id="late-checkin-title" className="pb-1! text-xl! font-bold!">Un instant pour votre humeur</DialogTitle>
    <p id="late-checkin-description" className="shrink-0 px-6 pb-3 text-xs text-muted [@media(max-height:650px)]:sr-only">Le même baromètre, le même tour. Le minuteur est en pause et tous les passages sont conservés.</p>
    <DialogContent className="flex min-h-0 flex-1 flex-col px-3! py-0! sm:px-5!">
      {timer.lateChecking && <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.5fr)_minmax(280px,.8fr)] gap-3 max-[800px]:grid-cols-1 max-[800px]:grid-rows-[minmax(0,1fr)_auto]">
        <MoodMeter locked className="[&_[id=meter-slide-stack]]:auto-rows-[minmax(44px,1fr)]" />
        <section className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-slate-50/60 p-3 ${people.length > 1 ? 'max-[800px]:h-48' : 'max-[800px]:h-40'} [@media(max-height:650px)]:p-2 [&_.list-pagination.invisible]:hidden [&_.late-checkin-list]:mt-1 [&_.late-checkin-list]:p-0`} aria-label="Humeurs des personnes reportées">
          <h2 className="shrink-0 text-sm font-bold">Rejoindre le tour · {people.length}</h2>
          {people.length ? <PaginatedList className="late-checkin-list" items={people} renderItem={person => <li key={person.id} className="flex h-24 shrink-0 flex-col justify-center gap-2 rounded-xl border border-line bg-white px-3">
            <strong className="truncate text-sm" title={person.name}>{person.name}</strong>
            <div className="flex gap-2" role="group" aria-label={`Humeur de ${person.name} : choisissez de 1 à 4`}>
              {([1, 2, 3, 4] as Mood[]).map(mood => <button key={mood} type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-white text-sm font-bold text-brand hover:border-brand hover:bg-blue-50 disabled:opacity-40" disabled={!dailyReady || cloudStatus !== 'saved'} aria-label={`Humeur ${mood} pour ${person.name}`} onClick={() => timer.rejoin(person.id, mood)}>{mood}</button>)}
            </div>
          </li>} /> : <p role="status" className="my-auto py-3 text-sm text-success">Toutes les personnes ont rejoint le tour. Reprenez lorsque vous êtes prêt.</p>}
        </section>
      </div>}
    </DialogContent>
    <DialogActions><Button onClick={timer.closeLateCheckin} sx={{ minHeight: 44 }}>Revenir au tour</Button></DialogActions>
  </Dialog>;
}