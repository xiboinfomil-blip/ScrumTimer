import type { StandupTimer } from './timer-page';
import { motion, useReducedMotion } from 'framer-motion';

export function SpeakerSlider({ timer }: { timer: StandupTimer }) {
  const reduced = useReducedMotion();
  const index = timer.people.findIndex(person => person.id === timer.activeId);
  const previous = timer.people.find(person => person.id === timer.previousId);
  const upcoming = [...timer.people.slice(index + 1), ...timer.people.slice(0, index)].find(person => !person.done);
  return <div id="speaker-slider" className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,3fr)_minmax(0,1fr)] items-center gap-2 border-b border-line px-1 py-2 max-[650px]:gap-1" aria-label="Ordre de parole">
    <div className="min-w-0 border-r border-line pr-2 text-left"><span className="block text-[9px] font-medium tracking-wide text-muted">← PRÉCÉDENT</span><p className="mt-1 truncate text-xs text-success" title={previous?.name}>{previous?.name ?? 'Début du tour'}</p></div>
    <motion.div key={timer.activeId} id="speaker-turn-cue" initial={reduced ? false : { opacity: .6, scale: .94 }} animate={{ opacity: 1, scale: 1 }} transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 280, damping: 24 }} className={`min-w-0 rounded-xl border px-2 py-2 max-[650px]:px-1 max-[650px]:py-1 ${timer.ended ? 'border-red-200 bg-danger-soft text-danger' : timer.running ? 'border-brand bg-brand text-white' : 'border-orange-200 bg-orange-50 text-brand'}`} role="status" aria-live="polite" aria-atomic="true">
      <span className="flex items-center justify-center gap-1.5 text-[11px] font-bold max-[650px]:text-[9px]"><svg className="size-4 shrink-0 max-[650px]:size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg>{timer.ended ? 'Merci de passer la parole' : timer.running ? 'À TOI DE PARLER !' : 'TON TOUR EST EN PAUSE'}</span>
      <h2 id="speaker-name" className="mt-1 truncate text-3xl font-extrabold leading-tight tracking-tight max-[650px]:text-xl" title={timer.person?.name}>{timer.person?.name}</h2>
    </motion.div>
    <div className="min-w-0 border-l border-line pl-2 text-right"><span className="block text-[9px] font-medium tracking-wide text-muted">À SUIVRE →</span><p id="upcoming-speaker" className="mt-1 truncate text-xs font-medium text-brand" title={upcoming?.name}>{upcoming?.name ?? 'Fin du tour'}</p></div>
  </div>;
}