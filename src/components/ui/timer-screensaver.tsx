'use client';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';


import { useEffect, useRef, useState } from 'react';

import { Button, Button as IconButton } from '@/components/ui/button';
import { X as CloseRounded } from 'lucide-react';
import { Pause as PauseRounded } from 'lucide-react';
import { Play as PlayArrowRounded } from 'lucide-react';
import { Trophy as EmojiEventsRounded } from 'lucide-react';
import { ArrowLeft as ArrowBackRounded } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { dailyRoundStatistics, type HistoryRound } from '@/lib/history/history';
import { formatTime } from '@/lib/timer/timer';
import { PaginatedList } from './paginated-list';
import { ScreensaverBackdrop } from './screensaver-backdrop';

export function TimerScreensaver({ open, onClose, onResume, teamName, speaker = '', round }: { open: boolean; onClose: () => void; onResume?: () => void; teamName: string; speaker?: string; round?: HistoryRound }) {
  const reduced = useReducedMotion();
  const closeButton = useRef<HTMLButtonElement>(null);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (!open) return;
    const update = () => setNow(new Date());
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [open]);
  const moving = !reduced && !paused && open;
  const stats = round ? dailyRoundStatistics(round) : null;
  const returnLabel = round ? 'Revenir au bilan' : 'Revenir au minuteur';
  return <Dialog open={open} onOpenChange={next => { if (!next) (onClose)?.(); }}><DialogContent showCloseButton={false} className="min-h-0 h-dvh! max-h-none! w-full! max-w-none! overflow-hidden! rounded-none! bg-white! p-0! inset-0 top-0 left-0 h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 rounded-none" aria-labelledby="screensaver-title" onOpenAutoFocus={event => { event.preventDefault(); (() => closeButton.current?.focus())(); }} onCloseAutoFocus={event => { event.preventDefault(); (() => document.getElementById(round ? 'daily-screensaver-button' : 'navbar-settings-button')?.focus())(); }}>
    <div data-testid="timer-screensaver" data-scene="horloge" data-motion={moving ? 'running' : 'paused'} data-completed={Boolean(round)} className="relative isolate flex h-dvh min-h-0 flex-col overflow-hidden bg-[#f4f8fa] text-[#173c51] [&_button]:transform-none!">
      <ScreensaverBackdrop moving={moving} />
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 py-3 sm:px-8 sm:py-4 [@media(max-height:500px)]:py-1">
        <DialogTitle id="screensaver-title" className="flex items-center gap-2 text-sm font-bold"><span className="h-5 w-1 bg-accent" aria-hidden="true" />{round ? 'Point terminé' : 'Économiseur d’écran'}</DialogTitle>
        <TooltipProvider><Tooltip disableHoverableContent><TooltipTrigger asChild><IconButton ref={closeButton} autoFocus aria-label={returnLabel} onClick={onClose} className="h-12! w-12! bg-white! text-brand! shadow-sm" variant="ghost" size="icon"><CloseRounded /></IconButton></TooltipTrigger><TooltipContent>{returnLabel}</TooltipContent></Tooltip></TooltipProvider>
      </header>
      <div data-screensaver-content className={`grid min-h-0 flex-1 gap-4 px-4 pb-4 sm:px-8 ${round ? 'grid-rows-[auto_minmax(0,1fr)] min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[900px]:grid-rows-1 [@media(max-height:500px)]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]! [@media(max-height:500px)]:grid-rows-1!' : 'grid-cols-1'}`}>
        <div className={`flex min-h-0 min-w-0 flex-col items-center justify-center text-center ${round ? 'gap-2 min-[900px]:gap-5' : 'gap-5 [@media(max-height:500px)]:gap-2 [@media(max-height:400px)]:gap-1!'}`}>
          <motion.div animate={{ y: moving ? [0, -9, 0] : 0, rotate: moving ? [0, -6, 0, 6, 0] : 0 }} transition={moving ? { duration: 5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }} className={round ? 'hidden min-[900px]:block [@media(max-height:500px)]:hidden!' : '[@media(max-height:400px)]:hidden'}><img src="/icon.svg" alt="Infomil" width="56" height="56" className="size-14 [@media(max-height:500px)]:size-9" /></motion.div>
          <p title={teamName} className={`line-clamp-2 max-w-full break-words font-semibold ${round ? 'text-sm min-[900px]:text-xl' : 'text-lg sm:text-2xl'}`}>{teamName}</p>
          <time dateTime={now?.toISOString()} className={`flex max-w-full items-baseline font-light leading-none tabular-nums ${round ? 'text-5xl min-[900px]:text-8xl [@media(max-height:500px)]:text-4xl!' : 'text-7xl sm:text-9xl [@media(max-height:500px)]:text-6xl!'}`} aria-live="off">{now ? <><span>{String(now.getHours()).padStart(2, '0')}</span><motion.span animate={{ opacity: moving ? [1, .25, 1] : 1 }} transition={moving ? { duration: 2, repeat: Infinity } : { duration: 0 }}>:</motion.span><span>{String(now.getMinutes()).padStart(2, '0')}</span><span className="ml-2 border-l border-brand/30 pl-2 text-xl font-semibold text-brand">{String(now.getSeconds()).padStart(2, '0')}</span></> : '--:--'}</time>
          <p className={`text-sm font-semibold [@media(max-height:400px)]:hidden ${round ? 'hidden min-[900px]:block' : ''}`}>{now ? new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now) : ''}</p>
          <div className={`grid max-w-full justify-items-center gap-2 border-t-2 border-accent pt-3 ${round ? 'hidden min-[900px]:grid [@media(max-height:500px)]:hidden!' : ''}`}><span className="text-xs font-semibold uppercase">{round ? 'Merci à toute l’équipe' : 'Minuteur en pause'}</span><p title={round ? undefined : speaker} className="line-clamp-2 max-w-full break-words text-xl font-bold sm:text-3xl [@media(max-height:500px)]:text-base">{round ? `${round.people.length} passages partagés` : speaker}</p></div>
        </div>
        {stats && <section data-screensaver-leaderboard className="flex min-h-0 min-w-0 flex-col border-t-2 border-accent bg-white/95 px-3 py-2 sm:px-5 sm:py-4" aria-labelledby="screensaver-ranking-title">
          <header className="flex shrink-0 items-center gap-3 border-b border-line pb-2"><EmojiEventsRounded className="text-amber-700" /><div className="min-w-0 flex-1"><h3 id="screensaver-ranking-title" className="text-base font-bold">Classement du jour</h3><p className="text-xs text-muted">{round?.people.length} participants · / 1 000 pts</p></div></header>
          <PaginatedList items={stats.ranked} ordered className="screensaver-score-list py-1" renderItem={person => <li key={person.id} data-screensaver-person={person.id} className={`flex h-16 shrink-0 items-center gap-2 border-b border-line px-1 ${person.rank === 1 ? 'bg-orange-50' : ''}`}><span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${person.rank === 1 ? 'bg-accent text-ink' : 'bg-blue-50 text-brand'}`}>{person.rank ?? '—'}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold" title={person.name}>{person.name}</p><p className="text-xs text-muted">{formatTime(person.speakingSeconds)}</p></div><strong className="shrink-0 text-sm tabular-nums text-brand">{person.score ?? '—'} <span className="text-[10px] font-normal">pts</span></strong></li>} />
        </section>}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-brand/15 bg-white px-3 py-3 [@media(max-height:500px)]:py-1">
        <TooltipProvider><Tooltip disableHoverableContent><TooltipTrigger asChild><span><IconButton disabled={Boolean(reduced)} aria-label={paused ? 'Animer le décor' : 'Arrêter les animations'} aria-pressed={paused || Boolean(reduced)} onClick={() => setPaused(value => !value)} className="size-12! text-brand!" variant="ghost" size="icon">{paused || reduced ? <PlayArrowRounded /> : <PauseRounded />}</IconButton></span></TooltipTrigger><TooltipContent>{paused || reduced ? 'Animations arrêtées' : 'Arrêter les animations'}</TooltipContent></Tooltip></TooltipProvider>
        <Button onClick={round ? onClose : onResume} className="min-h-12! rounded-lg! px-6! normal-case!" variant="default">{round ? <ArrowBackRounded /> : <PlayArrowRounded />}{round ? 'Revenir au bilan' : 'Reprendre le passage'}</Button>
      </footer>
    </div>
  </DialogContent></Dialog>;
}