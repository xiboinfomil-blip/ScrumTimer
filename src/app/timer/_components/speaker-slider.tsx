import type { StandupTimer } from './timer-page';
import { motion, useReducedMotion } from 'framer-motion';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

export function SpeakerSlider({ timer }: { timer: StandupTimer }) {
  const reduced = useReducedMotion();
  const index = timer.people.findIndex(person => person.id === timer.activeId);
  const previous = timer.people.find(person => person.id === timer.previousId);
  const upcoming = [...timer.people.slice(index + 1), ...timer.people.slice(0, Math.max(0, index))].filter(person => person.id !== timer.activeId && !person.done && !person.postponed);
  return <div id="speaker-slider" className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 border-b border-line pb-2 text-left" aria-label="Ordre de parole">
    <div className="min-w-0 self-center"><span className="block text-[10px] font-medium text-muted"><ArrowBackIcon aria-hidden="true" sx={{ fontSize: 12 }} /> Précédent</span><p className="truncate text-xs text-muted" title={previous?.name}>{previous?.name ?? 'Début du tour'}</p></div>
    <motion.div key={upcoming[0]?.id ?? 'finished'} initial={reduced ? false : { opacity: .6, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : .2 }} className="min-w-0 border-l-2 border-accent pl-3">
      <span className="flex items-center gap-1 text-[10px] font-semibold text-brand">À suivre <ArrowForwardIcon aria-hidden="true" sx={{ fontSize: 12 }} /></span>
      <p id="upcoming-speaker" className="truncate text-sm font-bold text-ink" title={upcoming[0]?.name}>{upcoming[0]?.name ?? 'Fin du tour'}</p>
      <p className="truncate text-[10px] text-muted" title={upcoming[1]?.name}>{upcoming[1] ? `Puis : ${upcoming[1].name}` : upcoming[0] ? 'Dernier passage à venir' : 'Aucun autre passage'}</p>
    </motion.div>
  </div>;
}