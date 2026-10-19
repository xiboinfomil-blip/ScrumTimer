import type { StandupTimer } from './timer-page';
import { motion, useReducedMotion } from 'framer-motion';
import MicIcon from '@mui/icons-material/Mic';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

export function SpeakerSlider({ timer }: { timer: StandupTimer }) {
  const reduced = useReducedMotion();
  const index = timer.people.findIndex(person => person.id === timer.activeId);
  const previous = timer.people.find(person => person.id === timer.previousId);
  const upcoming = [...timer.people.slice(index + 1), ...timer.people.slice(0, index)].find(person => !person.done && !person.postponed);
  return <div id="speaker-slider" className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2" aria-label="Ordre de parole">
    <motion.div key={timer.activeId} id="speaker-turn-cue" initial={reduced ? false : { opacity: .6, scale: .94 }} animate={{ opacity: 1, scale: 1 }} transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 280, damping: 24 }} className={`col-span-full min-w-0 rounded-2xl px-3 py-3 max-[650px]:py-2 [@media(max-height:650px)]:py-1 ${timer.ended ? 'bg-danger-soft text-danger' : timer.running ? 'bg-blue-50/70 text-brand' : 'bg-orange-50 text-brand'}`} role="status" aria-live="polite" aria-atomic="true">
      <span className="flex items-center justify-center gap-1.5 text-[11px] font-bold max-[650px]:text-[9px]"><MicIcon className="size-4 shrink-0 max-[650px]:size-3" sx={{ fontSize: 16 }} aria-hidden="true" />{timer.ended ? 'Merci de passer la parole' : timer.running ? 'À TOI DE PARLER !' : 'TON TOUR EST EN PAUSE'}</span>
      <h2 id="speaker-name" className="mt-1 truncate text-4xl font-extrabold leading-tight tracking-tight max-[650px]:text-2xl [@media(max-height:650px)]:text-2xl" title={timer.person?.name}>{timer.person?.name}</h2>
    </motion.div>
    <div className="min-w-0 text-left [@media(max-height:650px)]:hidden"><span className="block text-[9px] font-medium tracking-wide text-muted"><ArrowBackIcon aria-hidden="true" sx={{ fontSize: 12 }} /> PRÉCÉDENT</span><p className="truncate text-xs text-success" title={previous?.name}>{previous?.name ?? 'Début du tour'}</p></div>
    <div className="min-w-0 text-right [@media(max-height:650px)]:hidden"><span className="block text-[9px] font-medium tracking-wide text-muted">À SUIVRE <ArrowForwardIcon aria-hidden="true" sx={{ fontSize: 12 }} /></span><p id="upcoming-speaker" className="truncate text-xs font-medium text-brand" title={upcoming?.name}>{upcoming?.name ?? 'Fin du tour'}</p></div>
  </div>;
}