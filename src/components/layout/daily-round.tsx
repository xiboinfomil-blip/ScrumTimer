'use client';

import { useState } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import WallpaperRounded from '@mui/icons-material/WallpaperRounded';
import { useTeam } from '@/providers/team-provider';
import { DailyDashboard } from './daily-dashboard';
import { TimerScreensaver } from '@/components/ui/timer-screensaver';

/** Available on every device, even after the transient timer/session is gone. */
export function DailyRound({ autoScreensaver = false }: { autoScreensaver?: boolean }) {
  const { todayRound: round, activeTeamName } = useTeam();
  const [screensaverOpen, setScreensaverOpen] = useState(autoScreensaver);
  if (!round) return null;
  return <section className="mx-auto flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden max-[650px]:gap-2 [@media(max-height:650px)]:gap-1" aria-label="Point quotidien du jour">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-3 [@media(max-height:650px)]:pb-1">
      <div className="min-w-0 flex-1 basis-40">
        <h1 className="text-xl font-bold tracking-tight text-ink">Bilan du jour</h1>
        <p className="mt-1 flex items-center gap-2 text-xs text-success"><span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success" />Point terminé · {new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Mauritius', day: 'numeric', month: 'long' }).format(new Date(round.completedAt))}</p>
        <p className="mt-1 truncate text-xs text-muted" title={activeTeamName}>{activeTeamName} · {round.people.length} participants</p>
        <span className="sr-only">Point quotidien terminé aujourd’hui</span>
      </div>
      <Tooltip title="Économiseur d’écran"><IconButton id="daily-screensaver-button" aria-label="Économiseur d’écran" onClick={() => setScreensaverOpen(true)} className="size-12! shrink-0 text-brand!"><WallpaperRounded /></IconButton></Tooltip>
    </header>
    <DailyDashboard round={round} />
    <TimerScreensaver open={screensaverOpen} onClose={() => setScreensaverOpen(false)} teamName={activeTeamName} round={round} />
  </section>;
}