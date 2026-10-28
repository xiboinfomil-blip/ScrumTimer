'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Dialog } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import { motion, useReducedMotion } from 'framer-motion';
import { shuffle } from '@/lib/team/shuffle';

export interface RevealPerson {
  id: string;
  name: string;
  postponed: boolean;
  locked?: boolean;
}

export function LineupRevealDialog({ people, order, onCancel, onComplete }: {
  people: RevealPerson[];
  order: string[];
  onCancel: () => void;
  onComplete: () => void;
}) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(true);
  const [displayOrder, setDisplayOrder] = useState(() => people.map(person => person.id));
  const [phase, setPhase] = useState<'gathering' | 'mixing' | 'ready' | 'leaving'>('gathering');
  const byId = new Map(people.map(person => [person.id, person]));
  const first = order.map(id => byId.get(id)).find(person => person && !person.postponed && !person.locked);
  const cards = useRef(new Map<string, HTMLLIElement>());
  const positions = useRef(new Map<string, DOMRect>());

  // Explicit FLIP transforms keep cards moving even inside a scrolling MUI portal.
  useLayoutEffect(() => {
    const animations: Animation[] = [];
    cards.current.forEach((card, id) => {
      const next = card.getBoundingClientRect();
      const previous = positions.current.get(id);
      if (!reduced && previous && (previous.x !== next.x || previous.y !== next.y)) {
        animations.push(card.animate([
          { transform: `translate(${previous.x - next.x}px, ${previous.y - next.y}px)` },
          { transform: 'translate(0, 0)' },
        ], { duration: 950, easing: 'cubic-bezier(.45,0,.2,1)' }));
      }
      positions.current.set(id, next);
    });
    return () => animations.forEach(animation => animation.cancel());
  }, [displayOrder, reduced]);

  useEffect(() => {
    if (!open) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (delay: number, action: () => void) => timers.push(setTimeout(action, delay));
    if (reduced) {
      schedule(0, () => { setDisplayOrder(order); setPhase('ready'); });
      schedule(1600, () => setPhase('leaving'));
    } else {
      schedule(600, () => setPhase('mixing'));
      for (let round = 0; round < 3; round++) {
        schedule(600 + round * 1000, () => {
          cards.current.forEach((card, id) => positions.current.set(id, card.getBoundingClientRect()));
          setDisplayOrder(current => {
          const eligible = current.filter(id => !people.find(person => person.id === id)?.locked);
          const mixed = round === 2 ? order.filter(id => eligible.includes(id)) : shuffle(eligible, true);
          let index = 0;
          return current.map(id => eligible.includes(id) ? mixed[index++] : id);
          });
        });
      }
      schedule(3600, () => { setDisplayOrder(order); setPhase('ready'); });
      schedule(5100, () => setPhase('leaving'));
    }
    return () => timers.forEach(clearTimeout);
  }, [open, order, people, reduced]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const timeout = setTimeout(() => setOpen(false), reduced ? 0 : 650);
    return () => clearTimeout(timeout);
  }, [phase, reduced]);

  const ready = phase === 'ready' || phase === 'leaving';
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="md" aria-labelledby="lineup-reveal-title" aria-describedby="lineup-reveal-description"
      transitionDuration={reduced ? 0 : 350} slotProps={{ transition: { onExited: onComplete }, paper: { className: 'w-[calc(100%-24px)] !m-3 !flex !max-h-[calc(100dvh-24px)] !flex-col !overflow-hidden !rounded-3xl !p-0' } }}>
      <motion.div className="flex min-h-0 flex-col" initial={false} animate={phase === 'leaving' && !reduced ? { opacity: 0, scale: .97, y: -12 } : { opacity: 1, scale: 1, y: 0 }} transition={{ duration: reduced ? 0 : .65, ease: [.22, 1, .36, 1] }}>
      <div className="relative shrink-0 overflow-hidden border-b border-line bg-blue-50/60 px-4 pb-4 pt-5 sm:px-7 sm:pt-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full border-[24px] border-brand/5" />
        <div className="relative flex items-center gap-3">
          <motion.span aria-hidden="true" className={`grid size-12 shrink-0 place-items-center rounded-2xl ${ready ? 'bg-success-soft text-success' : 'bg-brand text-white'}`}
            animate={!reduced && phase === 'mixing' ? { rotate: [0, 180, 360] } : { rotate: 0 }}
            transition={phase === 'mixing' ? { duration: 1.2, repeat: Infinity, ease: 'linear' } : { duration: 0 }}>
            {ready ? <CheckIcon aria-hidden="true" sx={{ fontSize: 24 }} /> : <ShuffleIcon aria-hidden="true" sx={{ fontSize: 24 }} />}
          </motion.span>
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-brand">À chacun son moment</p>
            <h2 id="lineup-reveal-title" className="text-lg font-bold tracking-tight text-ink sm:text-2xl">Place au hasard, place à l’équipe.</h2>
          </div>
        </div>
        <p id="lineup-reveal-description" className="relative mt-3 text-xs leading-relaxed text-muted">Trois secondes pour préparer l’ordre de passage. Ensuite, place au baromètre d’humeur : cet ordre sera conservé jusqu’au minuteur.</p>
      </div>

      <div className="flex min-h-0 flex-col px-3 py-3 sm:px-7 sm:py-5">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2 text-[11px]">
          <span className="font-semibold text-ink" role="status" aria-live="polite">{ready ? 'L’ordre de passage est prêt' : phase === 'mixing' ? 'Le hasard redistribue les cartes…' : 'Toute l’équipe entre en scène'}</span>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 tabular-nums text-muted">{people.length} personne{people.length > 1 ? 's' : ''}</span>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-1" tabIndex={0} role="region" aria-label="Cartes des participants" aria-busy={!ready}>
          <ol className="grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4" aria-label="Ordre de passage">
            {displayOrder.map((id, index) => {
              const person = byId.get(id)!;
              const leading = ready && first?.id === id;
              return (
                <li key={id} data-person-id={id} ref={element => { if (element) cards.current.set(id, element); else cards.current.delete(id); }}
                  className={`relative flex min-w-0 flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-center sm:py-4 ${leading ? 'border-accent bg-orange-50 ring-2 ring-inset ring-accent/15' : person.postponed ? 'border-amber-200 bg-amber-50/40' : 'border-blue-100 bg-white'}`}>
                  <span className="absolute left-2 top-2 text-[10px] font-bold tabular-nums text-muted" aria-hidden="true">{ready ? String(index + 1).padStart(2, '0') : '· ·'}</span>
                  <span aria-hidden="true" className={`mt-1 grid size-10 place-items-center rounded-2xl text-sm font-bold sm:size-12 ${leading ? 'bg-accent text-white' : 'bg-blue-50 text-brand'}`}>{person.name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('')}</span>
                  <strong className="w-full truncate text-xs font-semibold text-ink" title={person.name}>{person.name}</strong>
                  <span className={`text-[10px] ${leading ? 'font-bold text-amber-800' : 'text-muted'}`}>{person.postponed ? 'En attente' : person.locked ? 'Place conservée' : leading ? 'Prochaine personne' : ready ? 'À suivre' : 'Dans le mélange'}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-slate-50/70 px-4 py-3 sm:px-7 sm:py-4">
        <div aria-hidden="true" className="mb-3 flex gap-1.5">{['gathering', 'mixing', 'ready'].map((step, index) => <span key={step} className={`h-1 flex-1 rounded-full transition-colors motion-reduce:transition-none ${index <= (ready ? 2 : phase === 'mixing' ? 1 : 0) ? 'bg-brand' : 'bg-slate-200'}`} />)}</div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="min-w-0 text-[11px] text-muted">{ready ? 'Tout est prêt. Place aux humeurs…' : 'Un nouvel ordre, une même équipe.'}</p>
          <div className="ml-auto flex gap-1">
            <Button variant="text" onClick={onCancel}>Annuler</Button>
            <Button variant="contained" disabled={phase === 'leaving'} onClick={() => setPhase('leaving')}>Aller aux humeurs</Button>
          </div>
        </div>
      </div>
      </motion.div>
    </Dialog>
  );
}
