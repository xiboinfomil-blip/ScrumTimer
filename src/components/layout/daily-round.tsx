'use client';

import { useRef, useState } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import WallpaperRounded from '@mui/icons-material/WallpaperRounded';
import FullscreenExitRounded from '@mui/icons-material/FullscreenExitRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded';
import { useReducedMotion } from 'framer-motion';
import { useTeam } from '@/providers/team-provider';
import { DailyDashboard } from './daily-dashboard';
import { usePresentation } from '@/hooks/timer/use-presentation';
import { ScreensaverBackdrop } from '@/components/ui/screensaver-backdrop';

/** Available on every device, even after the transient timer/session is gone. */
export function DailyRound() {
  const { todayRound: round, activeTeamName } = useTeam();
  const target = useRef<HTMLElement>(null);
  const presentation = usePresentation(target);
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  if (!round) return null;
  return <section ref={target} data-daily-results data-awards-motion={!reduced && !paused ? 'running' : 'paused'} className={`relative isolate mx-auto flex min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden bg-[#f4f8fa] p-5 max-[650px]:gap-2 max-[650px]:p-2.5 [@media(max-height:650px)]:gap-2 [@media(max-height:650px)]:p-2 ${presentation.presenting ? 'fixed inset-0 z-[2500] sm:p-8' : ''}`} aria-label="Point quotidien du jour">
    <ScreensaverBackdrop moving={!reduced && !paused} />
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-brand/15 pb-3 [@media(max-height:650px)]:pb-1">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-lg border border-[#d6aa54] bg-[#fff5d8] text-[#906114] max-[650px]:hidden"><EmojiEventsRounded fontSize="large" /></span>
        <div className="min-w-0"><p className="mb-1 text-[11px] font-semibold text-success [@media(max-height:650px)]:hidden">Point terminé · {new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Mauritius', day: 'numeric', month: 'long' }).format(new Date(round.completedAt))}</p>
        <h1 className="text-2xl font-extrabold text-brand max-[650px]:text-xl [@media(max-height:400px)]:text-lg">Bilan du jour</h1>
        <p className="mt-0.5 truncate text-xs text-muted" title={activeTeamName}>{activeTeamName} · {round.people.length} participants</p></div>
        <span className="sr-only">Point quotidien terminé aujourd’hui</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Tooltip title={paused || reduced ? 'Animations arrêtées' : 'Arrêter les animations'}><span><IconButton disabled={Boolean(reduced)} aria-label={paused ? 'Animer le décor du bilan' : 'Arrêter les animations du bilan'} aria-pressed={paused || Boolean(reduced)} onClick={() => setPaused(value => !value)} className="size-11! text-brand!">{paused || reduced ? <PlayArrowRounded /> : <PauseRounded />}</IconButton></span></Tooltip>
        <Tooltip title={presentation.presenting ? 'Quitter la présentation du bilan' : 'Présenter le bilan'}><IconButton id="daily-screensaver-button" aria-label={presentation.presenting ? 'Quitter la présentation du bilan' : 'Présenter le bilan'} aria-pressed={presentation.presenting} onClick={() => void presentation.toggle()} className="size-11! text-brand!">{presentation.presenting ? <FullscreenExitRounded /> : <WallpaperRounded />}</IconButton></Tooltip>
      </div>
    </header>
    <DailyDashboard round={round} />
    {presentation.notice && <p role="status" className="shrink-0 text-xs text-muted">{presentation.notice}</p>}
  </section>;
}