'use client';

import { useRef } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import WallpaperRounded from '@mui/icons-material/WallpaperRounded';
import FullscreenExitRounded from '@mui/icons-material/FullscreenExitRounded';
import { useTeam } from '@/providers/team-provider';
import { DailyDashboard } from './daily-dashboard';
import { usePresentation } from '@/hooks/timer/use-presentation';

/** Available on every device, even after the transient timer/session is gone. */
export function DailyRound() {
  const { todayRound: round, activeTeamName } = useTeam();
  const target = useRef<HTMLElement>(null);
  const presentation = usePresentation(target);
  if (!round) return null;
  return <section ref={target} data-daily-results className={`mx-auto flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden max-[650px]:gap-2 [@media(max-height:650px)]:gap-1 ${presentation.presenting ? 'fixed inset-0 z-[2500] bg-[#f4f8fc] p-4 sm:p-8' : ''}`} aria-label="Point quotidien du jour">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-3 [@media(max-height:650px)]:pb-1">
      <div className="min-w-0 flex-1 basis-40">
        <h1 className="text-xl font-bold tracking-tight text-ink">Bilan du jour</h1>
        <p className="mt-1 flex items-center gap-2 text-xs text-success"><span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success" />Point terminé · {new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Mauritius', day: 'numeric', month: 'long' }).format(new Date(round.completedAt))}</p>
        <p className="mt-1 truncate text-xs text-muted" title={activeTeamName}>{activeTeamName} · {round.people.length} participants</p>
        <span className="sr-only">Point quotidien terminé aujourd’hui</span>
      </div>
      <Tooltip title={presentation.presenting ? 'Quitter la présentation du bilan' : 'Présenter le bilan'}><IconButton id="daily-screensaver-button" aria-label={presentation.presenting ? 'Quitter la présentation du bilan' : 'Présenter le bilan'} aria-pressed={presentation.presenting} onClick={() => void presentation.toggle()} className="size-12! shrink-0 text-brand!">{presentation.presenting ? <FullscreenExitRounded /> : <WallpaperRounded />}</IconButton></Tooltip>
    </header>
    <DailyDashboard round={round} />
    {presentation.notice && <p role="status" className="shrink-0 text-xs text-muted">{presentation.notice}</p>}
  </section>;
}