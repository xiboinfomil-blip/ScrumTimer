import type { StandupTimer } from './timer-page';

export function SpeakerSlider({ timer }: { timer: StandupTimer }) {
  const index = timer.people.findIndex(person => person.id === timer.activeId);
  const previous = timer.people.find(person => person.id === timer.previousId);
  const upcoming = [...timer.people.slice(index + 1), ...timer.people.slice(0, index)].find(person => !person.done);
  return <div id="speaker-slider" className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-2 border-b border-line px-1 py-2 max-[650px]:gap-1" aria-label="Ordre de parole">
    <div className="min-w-0 border-r border-line pr-2 text-left"><span className="block text-[9px] font-medium tracking-wide text-muted">← PRÉCÉDENT</span><p className="mt-1 truncate text-xs text-success" title={previous?.name}>{previous?.name ?? 'Début du tour'}</p></div>
    <div key={timer.activeId} className="min-w-0 px-1 motion-safe:animate-enter"><span className={`block text-[9px] font-semibold ${timer.ended ? 'text-danger' : 'text-brand'}`}>{timer.ended ? 'Temps écoulé' : timer.running ? 'À la parole' : 'En pause'}</span><h2 id="speaker-name" className="truncate text-xl font-bold tracking-tight text-ink max-[650px]:text-lg" title={timer.person?.name} aria-live="polite" aria-atomic="true">{timer.person?.name}</h2></div>
    <div className="min-w-0 border-l border-line pl-2 text-right"><span className="block text-[9px] font-medium tracking-wide text-muted">À SUIVRE →</span><p id="upcoming-speaker" className="mt-1 truncate text-xs font-medium text-brand" title={upcoming?.name}>{upcoming?.name ?? 'Fin du tour'}</p></div>
  </div>;
}