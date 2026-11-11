'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Button, Dialog, IconButton, Tooltip } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import { motion, useReducedMotion } from 'framer-motion';

export function TimerScreensaver({ open, onClose, onResume, teamName, speaker }: { open: boolean; onClose: () => void; onResume: () => void; teamName: string; speaker: string }) {
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
  return <Dialog open={open} onClose={onClose} fullScreen aria-labelledby="screensaver-title" slotProps={{ paper: { className: 'm-0! h-dvh! max-h-none! w-full! max-w-none! overflow-hidden! rounded-none! bg-white! p-0!', sx: { zIndex: 3000 } }, root: { sx: { zIndex: 3000 } }, transition: { onEntered: () => closeButton.current?.focus(), onExited: () => document.getElementById('navbar-settings-button')?.focus() } }}>
    <div data-testid="timer-screensaver" data-scene="horloge" data-motion={moving ? 'running' : 'paused'} className="relative isolate flex h-dvh min-h-0 flex-col overflow-hidden bg-[#f4f8fa] text-[#173c51] [&_button]:transform-none!">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(#205f9d08_1px,transparent_1px),linear-gradient(90deg,#205f9d08_1px,transparent_1px)] bg-size-[64px_64px]" />
        <div className="absolute -inset-x-1/2 top-[68%] h-1/2 -rotate-12 opacity-60">
          {['bg-[#dcebf3]', 'bg-[#f5bd71]', 'bg-[#d3e8e3]'].map((color, index) => <motion.div key={color} animate={{ x: moving ? [0, index % 2 ? 100 : -100, 0] : 0, scaleY: moving ? [1, 1.15, 1] : 1 }} transition={moving ? { duration: 12 + index * 4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }} className={`h-1/3 w-full border-b-8 border-[#f4f8fa] ${color}`} />)}
        </div>
      </div>
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 py-3 sm:px-10 sm:py-5 [@media(max-height:500px)]:py-1">
        <h2 id="screensaver-title" className="text-sm font-bold">Économiseur d’écran</h2>
        <Tooltip title="Revenir au minuteur"><IconButton ref={closeButton} autoFocus aria-label="Revenir au minuteur" onClick={onClose} className="h-12! w-12! bg-white! text-brand! shadow-sm"><CloseRounded /></IconButton></Tooltip>
      </header>
      <div data-screensaver-content className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-4 text-center [@media(max-height:500px)]:gap-2 [@media(max-height:400px)]:gap-1!">
        <Box component="img" src="/icon.svg" alt="Infomil" width="56" height="56" className="size-14 shrink-0 [@media(max-height:500px)]:size-9 [@media(max-height:400px)]:hidden" />
        <p title={teamName} className="line-clamp-2 max-w-full break-words text-lg font-semibold sm:text-2xl">{teamName}</p>
        <time dateTime={now?.toISOString()} className="flex items-center text-7xl font-light leading-none tabular-nums sm:text-9xl [@media(max-height:500px)]:text-6xl" aria-live="off">{now ? <><span>{String(now.getHours()).padStart(2, '0')}</span><motion.span animate={{ opacity: moving ? [1, .25, 1] : 1 }} transition={moving ? { duration: 2, repeat: Infinity } : { duration: 0 }}>:</motion.span><span>{String(now.getMinutes()).padStart(2, '0')}</span></> : '--:--'}</time>
        <p className="text-sm font-semibold sm:text-base [@media(max-height:400px)]:hidden">{now ? new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now) : ''}</p>
        <div className="grid max-w-full justify-items-center gap-2 border-t-2 border-accent pt-3"><span className="text-xs font-semibold uppercase">Minuteur en pause</span><p title={speaker} className="line-clamp-2 max-w-full break-words text-xl font-bold sm:text-3xl [@media(max-height:500px)]:text-base">{speaker}</p></div>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-brand/15 bg-white px-3 py-4 [@media(max-height:500px)]:py-2">
        <Tooltip title={paused || reduced ? 'Animations arrêtées' : 'Arrêter les animations'}><span><IconButton disabled={Boolean(reduced)} aria-label={paused ? 'Animer le décor' : 'Arrêter les animations'} aria-pressed={paused || Boolean(reduced)} onClick={() => setPaused(value => !value)} className="size-12! text-brand!">{paused || reduced ? <PlayArrowRounded /> : <PauseRounded />}</IconButton></span></Tooltip>
        <Button variant="contained" disableElevation startIcon={<PlayArrowRounded />} onClick={onResume} className="min-h-12! rounded-lg! px-6! normal-case!">Reprendre le passage</Button>
      </footer>
    </div>
  </Dialog>;
}