import type { StandupTimer } from './timer-page';
import { motion, useReducedMotion } from 'framer-motion';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

export function SpeakerSlider({ timer, className = '' }: { timer: StandupTimer; className?: string }) {
  const reduced = useReducedMotion();
  const index = timer.people.findIndex(person => person.id === timer.activeId);
  const previous = timer.people.find(person => person.id === timer.previousId);
  const upcoming = [...timer.people.slice(index + 1), ...timer.people.slice(0, Math.max(0, index))].filter(person => person.id !== timer.activeId && !person.done && !person.postponed);
  return <div id="speaker-slider" className={`grid min-w-0 grid-cols-2 gap-2 border-b border-line pb-3 text-left [@media(max-height:650px)]:pb-1 ${className}`} aria-label="Ordre de parole" data-speaker-flow>
    <div className="min-w-0 self-stretch rounded-lg border border-line bg-slate-50 px-3 py-2 [@media(max-height:650px)]:px-2 [@media(max-height:650px)]:py-1">
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted [@media(max-height:650px)]:text-[9px]"><ArrowBackIcon aria-hidden="true" sx={{ fontSize: 13 }} /> Avant</span>
      <p className="mt-1 truncate text-sm font-semibold text-ink [@media(max-height:650px)]:mt-0 [@media(max-height:650px)]:text-xs" title={previous?.name}>{previous?.name ?? 'Début du tour'}</p>
    </div>
    <motion.div key={upcoming[0]?.id ?? 'finished'} initial={reduced ? false : { opacity: .6, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : .2 }} className="min-w-0 self-stretch rounded-lg border border-accent/40 bg-orange-50 px-3 py-2 [@media(max-height:650px)]:px-2 [@media(max-height:650px)]:py-1">
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-amber-800 [@media(max-height:650px)]:text-[9px]">À suivre <ArrowForwardIcon aria-hidden="true" sx={{ fontSize: 13 }} /></span>
      <p id="upcoming-speaker" className="mt-1 truncate text-base font-bold text-ink [@media(max-height:650px)]:mt-0 [@media(max-height:650px)]:text-sm" title={upcoming[0]?.name}>{upcoming[0]?.name ?? 'Fin du tour'}</p>
      <p className="truncate text-[10px] text-muted [@media(max-height:650px)]:hidden" title={upcoming[1]?.name}>{upcoming[1] ? `Puis : ${upcoming[1].name}` : upcoming[0] ? 'Dernier passage à venir' : 'Aucun autre passage'}</p>
    </motion.div>
  </div>;
}