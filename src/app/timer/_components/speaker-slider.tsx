import type { StandupTimer } from './timer-page';
import { motion, useReducedMotion } from 'framer-motion';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

export function SpeakerSlider({ timer, className = '' }: { timer: StandupTimer; className?: string }) {
  const reduced = useReducedMotion();
  const index = timer.people.findIndex(person => person.id === timer.activeId);
  const previous = timer.people.find(person => person.id === timer.previousId);
  const upcoming = [...timer.people.slice(index + 1), ...timer.people.slice(0, Math.max(0, index))].filter(person => person.id !== timer.activeId && !person.done && !person.postponed);
  const imminent = timer.running && timer.remaining <= Math.max(10, timer.warning);
  return <div id="speaker-slider" className={`grid min-w-0 grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] gap-3 border-b border-line pb-3 text-left max-[650px]:gap-2 [@media(max-height:650px)]:pb-1 ${className}`} aria-label="Ordre de parole" data-speaker-flow>
    <div className="min-w-0 self-stretch rounded-lg border border-line px-3 py-3 [@media(max-height:650px)]:px-2 [@media(max-height:650px)]:py-1">
      <span className="flex items-center gap-1 text-xs font-semibold text-muted [@media(max-height:650px)]:text-[10px]"><ArrowBackIcon aria-hidden="true" sx={{ fontSize: 16 }} /> Précédent</span>
      <p className="mt-1 truncate text-lg font-semibold text-muted max-[650px]:text-base [@media(max-height:650px)]:mt-0 [@media(max-height:650px)]:text-sm" title={previous?.name}>{previous?.name ?? 'Début du tour'}</p>
    </div>
    <motion.div key={upcoming[0]?.id ?? 'finished'} initial={reduced ? false : { opacity: .6, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : .3 }} role="status" aria-live="polite" aria-atomic="true" className="min-w-0 self-stretch rounded-lg border border-accent/50 border-r-4 border-r-accent bg-orange-50 px-4 py-3 text-right shadow-sm max-[650px]:px-3 [@media(max-height:650px)]:px-2 [@media(max-height:650px)]:py-1">
      <span className="flex items-center justify-end gap-2 text-xs font-bold text-amber-800 [@media(max-height:650px)]:text-[10px]">{imminent && upcoming[0] ? 'Préparez-vous' : 'À suivre'}<ArrowForwardIcon aria-hidden="true" sx={{ fontSize: 18 }} /></span>
      <p id="upcoming-speaker" className="mt-1 truncate text-2xl font-bold text-ink max-[650px]:text-xl [@media(max-height:650px)]:mt-0 [@media(max-height:650px)]:text-base" title={upcoming[0]?.name}>{upcoming[0]?.name ?? 'Fin du tour'}</p>
    </motion.div>
  </div>;
}