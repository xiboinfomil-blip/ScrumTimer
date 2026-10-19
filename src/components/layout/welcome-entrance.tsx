'use client';

import { useEffect, useRef } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import SentimentSatisfiedAltIcon from '@mui/icons-material/SentimentSatisfiedAlt';
import SentimentVerySatisfiedIcon from '@mui/icons-material/SentimentVerySatisfied';
import SentimentNeutralIcon from '@mui/icons-material/SentimentNeutral';
import BoltIcon from '@mui/icons-material/Bolt';

const moods = [
  { Icon: SentimentSatisfiedAltIcon, label: 'On se retrouve', color: 'bg-blue-100 text-brand', motion: 'motion-safe:animate-welcome-float' },
  { Icon: SentimentVerySatisfiedIcon, label: 'On partage', color: 'bg-orange-100 text-brand-dark', motion: 'motion-safe:animate-[welcome-float_3s_ease-in-out_.35s_infinite]' },
  { Icon: SentimentNeutralIcon, label: 'On s’écoute', color: 'bg-slate-100 text-brand', motion: 'motion-safe:animate-[welcome-float_3s_ease-in-out_.7s_infinite]' },
  { Icon: BoltIcon, label: 'On avance', color: 'bg-brand text-white', motion: 'motion-safe:animate-[welcome-float_3s_ease-in-out_1.05s_infinite]' },
];

/** Server-rendered cover: data and routes mount underneath, without waiting for them. */
export function WelcomeEntrance({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    const timeout = window.setTimeout(onClose, 5000);
    return () => {
      window.clearTimeout(timeout);
      queueMicrotask(() => {
        const target = previous instanceof HTMLElement && previous !== document.body && previous.isConnected
          ? previous : document.getElementById('main-content');
        target?.focus({ preventScroll: true });
      });
    };
  }, [onClose]);

  return <section role="dialog" aria-modal="true" aria-labelledby="welcome-title" aria-describedby="welcome-description" data-welcome-entrance
    onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') { event.preventDefault(); closeRef.current?.focus(); }
    }}
    className="fixed inset-0 z-[2100] flex min-h-0 flex-col overflow-y-auto bg-[#f5f8fd] text-ink motion-safe:animate-[welcome-cover_.5s_ease-out_both]">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-48 -left-32 size-[min(75vw,760px)] rounded-full bg-blue-200/40 blur-3xl motion-safe:animate-welcome-orbit" />
      <div className="absolute -right-32 -bottom-48 size-[min(80vw,700px)] rounded-full bg-orange-200/45 blur-3xl motion-safe:animate-[welcome-orbit_6s_ease-in-out_reverse_infinite]" />
      <div className="absolute top-1/2 left-1/2 size-[min(86vw,620px)] -translate-1/2 rounded-full border border-brand/10 motion-safe:animate-[welcome-ring_4s_ease-out_infinite]" />
      <div className="absolute top-1/2 left-1/2 size-[min(70vw,490px)] -translate-1/2 rounded-full border border-accent/20 motion-safe:animate-[welcome-ring_4s_ease-out_1s_infinite]" />
    </div>
    <header className="relative flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-10 sm:py-6">
      <span className="text-sm font-extrabold tracking-tight text-brand">infomil<span className="text-accent">.</span> <span className="ml-2 text-xs font-medium text-muted">Mauritius</span></span>
      <button ref={closeRef} type="button" onClick={onClose} aria-label="Fermer l’introduction" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-brand/15 bg-white/80 px-3 text-xs font-semibold text-brand hover:bg-white focus-visible:outline-3 focus-visible:outline-accent">
        <span className="max-[380px]:hidden">Passer l’intro</span><CloseIcon fontSize="small" />
      </button>
    </header>
    <div className="relative m-auto flex w-full max-w-3xl flex-col items-center px-5 py-6 text-center sm:px-10">
      <p className="mb-5 flex items-center gap-2 text-[10px] font-bold tracking-[.22em] text-brand uppercase motion-safe:animate-enter"><span className="size-2 rounded-full bg-accent" /> Un moment pour votre équipe</p>
      <div aria-hidden="true" className="mb-7 grid w-full max-w-sm grid-cols-4 gap-2 sm:gap-4">
        {moods.map(({ Icon, label, color, motion }) => <div key={label} className={motion}>
          <div className={`grid aspect-square place-items-center rounded-[24%] shadow-lg shadow-brand/5 ${color}`}><Icon className="!size-[55%]" /></div>
          <span className="mt-3 block text-[9px] font-semibold text-muted sm:text-xs">{label}</span>
        </div>)}
      </div>
      <h1 id="welcome-title" className="text-[clamp(2.8rem,9vw,6rem)] leading-[1.05] font-black tracking-[-.065em] text-brand motion-safe:animate-[welcome-title_.9s_cubic-bezier(.22,1,.36,1)_both]">Mood <span className="text-accent">Meter</span><span className="text-brand">.</span></h1>
      <p id="welcome-description" className="mt-5 max-w-md text-sm leading-relaxed text-muted sm:text-lg motion-safe:animate-[enter_.7s_ease-out_.3s_both]">Toutes les humeurs ont leur place.<br />Partageons la nôtre, puis avançons ensemble.</p>
      <div className="mt-8 w-48 sm:mt-10" aria-hidden="true">
        <div className="h-1 overflow-hidden rounded-full bg-brand/10"><div className="h-full origin-left rounded-full bg-gradient-to-r from-brand to-accent motion-safe:animate-[welcome-progress_5s_linear_both]" /></div>
        <p className="mt-3 text-[10px] font-medium tracking-wide text-muted">À vous dans quelques instants…</p>
      </div>
    </div>
    <p className="relative shrink-0 px-5 py-4 text-center text-[10px] text-muted">L’introduction se ferme automatiquement après 5 secondes.</p>
  </section>;
}