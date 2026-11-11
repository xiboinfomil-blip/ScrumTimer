'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Button, Dialog, IconButton, Tooltip } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import { motion, useReducedMotion } from 'framer-motion';
import { dailyRoundStatistics, type HistoryRound } from '@/lib/history/history';
import { formatTime } from '@/lib/timer/timer';
import { PaginatedList } from './paginated-list';

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
  return <Dialog open={open} onClose={onClose} fullScreen aria-labelledby="screensaver-title" slotProps={{ paper: { className: 'm-0! h-dvh! max-h-none! w-full! max-w-none! overflow-hidden! rounded-none! bg-white! p-0!' }, root: { sx: { zIndex: 3000 } }, transition: { onEntered: () => closeButton.current?.focus(), onExited: () => document.getElementById(round ? 'daily-screensaver-button' : 'navbar-settings-button')?.focus() } }}>
    <div data-testid="timer-screensaver" data-scene="horloge" data-motion={moving ? 'running' : 'paused'} data-completed={Boolean(round)} className="relative isolate flex h-dvh min-h-0 flex-col overflow-hidden bg-[#f4f8fa] text-[#173c51] [&_button]:transform-none!">
      <div aria-hidden="true" data-screensaver-decor className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div animate={{ x: moving ? [0, 64] : 0, y: moving ? [0, 64] : 0 }} transition={moving ? { duration: 12, repeat: Infinity, ease: 'linear' } : { duration: 0 }} className="absolute -inset-16 bg-[linear-gradient(#205f9d09_1px,transparent_1px),linear-gradient(90deg,#205f9d09_1px,transparent_1px)] bg-size-[64px_64px]" />
        <div className="absolute -inset-x-1/2 top-[65%] h-[65%] -rotate-12">
          {['bg-[#c6e2ed]', 'bg-[#f5bd71]', 'bg-[#b8ddd1]', 'bg-white/80'].map((color, index) => <motion.div key={color} animate={{ y: moving ? [0, -35 - index * 12, 0] : 0, rotate: moving ? [0, index % 2 ? 5 : -5, 0] : 0, scaleY: moving ? [1, 1.3, 1] : 1 }} transition={moving ? { duration: 5 + index * 2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }} className={`h-1/4 w-full border-b-8 border-[#f4f8fa] ${color}`} />)}
        </div>
        <motion.div animate={{ x: moving ? ['-30%', '100%'] : '-30%' }} transition={moving ? { duration: 18, repeat: Infinity, ease: 'linear' } : { duration: 0 }} className="absolute inset-x-0 top-[22%] flex -rotate-12 gap-12 opacity-40"><span className="h-1.5 w-28 bg-brand" /><span className="h-1.5 w-16 bg-accent" /><span className="h-1.5 w-40 bg-success" /></motion.div>
      </div>
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 py-3 sm:px-8 sm:py-4 [@media(max-height:500px)]:py-1">
        <h2 id="screensaver-title" className="flex items-center gap-2 text-sm font-bold"><span className="h-5 w-1 bg-accent" aria-hidden="true" />{round ? 'Point terminé' : 'Économiseur d’écran'}</h2>
        <Tooltip title={returnLabel}><IconButton ref={closeButton} autoFocus aria-label={returnLabel} onClick={onClose} className="h-12! w-12! bg-white! text-brand! shadow-sm"><CloseRounded /></IconButton></Tooltip>
      </header>
      <div data-screensaver-content className={`grid min-h-0 flex-1 gap-4 px-4 pb-4 sm:px-8 ${round ? 'grid-rows-[auto_minmax(0,1fr)] min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[900px]:grid-rows-1 [@media(max-height:500px)]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]! [@media(max-height:500px)]:grid-rows-1!' : 'grid-cols-1'}`}>
        <div className={`flex min-h-0 min-w-0 flex-col items-center justify-center text-center ${round ? 'gap-2 min-[900px]:gap-5' : 'gap-5 [@media(max-height:500px)]:gap-2 [@media(max-height:400px)]:gap-1!'}`}>
          <motion.div animate={{ y: moving ? [0, -9, 0] : 0, rotate: moving ? [0, -6, 0, 6, 0] : 0 }} transition={moving ? { duration: 5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }} className={round ? 'hidden min-[900px]:block [@media(max-height:500px)]:hidden!' : '[@media(max-height:400px)]:hidden'}><Box component="img" src="/icon.svg" alt="Infomil" width="56" height="56" className="size-14 [@media(max-height:500px)]:size-9" /></motion.div>
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
        <Tooltip title={paused || reduced ? 'Animations arrêtées' : 'Arrêter les animations'}><span><IconButton disabled={Boolean(reduced)} aria-label={paused ? 'Animer le décor' : 'Arrêter les animations'} aria-pressed={paused || Boolean(reduced)} onClick={() => setPaused(value => !value)} className="size-12! text-brand!">{paused || reduced ? <PlayArrowRounded /> : <PauseRounded />}</IconButton></span></Tooltip>
        <Button variant="contained" disableElevation startIcon={round ? <ArrowBackRounded /> : <PlayArrowRounded />} onClick={round ? onClose : onResume} className="min-h-12! rounded-lg! px-6! normal-case!">{round ? 'Revenir au bilan' : 'Reprendre le passage'}</Button>
      </footer>
    </div>
  </Dialog>;
}