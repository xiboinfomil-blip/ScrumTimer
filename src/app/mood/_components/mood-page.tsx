'use client';

import Link from 'next/link';
import { Button } from '@mui/material';
import { useState } from 'react';
import { ScreenTabs } from '@/components/ui/screen-tabs';
import { WorkflowHeading } from '@/components/ui/workflow-heading';
import { routeStage, segmentedTabs } from '@/components/ui/styles';
import { useStepGuard } from '@/hooks/use-step-guard';
import { MoodMeter } from './mood-meter';
import { MoodCheckin } from './mood-checkin';
import { MoodIcon } from './mood-icon';

export function MoodPage() {
  const allowed = useStepGuard('mood');
  const [view, setView] = useState<'meter' | 'people'>('meter');
  if (!allowed) return null;
  return (
    <div id="mood-page" className={`${routeStage} mx-auto w-full max-w-6xl text-ink max-[650px]:[&>section:first-child_.MuiAvatar-root]:hidden max-[650px]:[&_h1]:text-lg`}>
      <WorkflowHeading step={2} title="Comment va l’équipe ?" description="Un instant pour soi, un repère pour l’équipe." action={<Button component={Link} href="/participants" aria-label="Retour aux participants" title="Retour aux participants" disableElevation size="small" variant="text" sx={{ minHeight: 44, minWidth: 44, textTransform: 'none', fontSize: 12 }} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-line bg-white px-3 text-xs text-muted hover:border-brand/25 hover:bg-blue-50 hover:text-brand"><MoodIcon name="back" /><span className="max-[650px]:sr-only">Participants</span></Button>} />
      <ScreenTabs
        className={`${segmentedTabs} h-13 border border-slate-200/70 p-1 [&>button]:min-h-11`}
        label="Panneau du bilan" value={view} onChange={setView}
        tabs={[{ value: 'meter', label: 'Baromètre' }, { value: 'people', label: 'Humeurs de l’équipe' }]} />
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)] items-stretch gap-4 max-[800px]:grid-cols-[minmax(0,1fr)] max-[650px]:gap-2" data-view={view}>
        <MoodMeter mobileVisible={view === 'meter'} className={view === 'meter' ? '' : 'max-[800px]:hidden'} />
        <MoodCheckin className={view === 'people' ? '' : 'max-[800px]:hidden'} />
      </div>
    </div>
  );
}