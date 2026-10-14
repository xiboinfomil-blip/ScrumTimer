'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ScreenTabs } from '@/components/ui/screen-tabs';
import { WorkflowHeading } from '@/components/ui/workflow-heading';
import { routeStage, segmentedTabs } from '@/components/ui/styles';
import { useStepGuard } from '@/hooks/use-step-guard';
import { MoodMeter } from './mood-meter';
import { MoodCheckin } from './mood-checkin';

export function MoodPage() {
  const allowed = useStepGuard('mood');
  const [view, setView] = useState<'meter' | 'people'>('meter');
  if (!allowed) return null;
  return (
    <div id="mood-page" className={`${routeStage} mx-auto w-full max-w-6xl text-ink`}>
      <WorkflowHeading step={2} title="Comment va l’équipe ?" description="Regardez le baromètre, puis choisissez 1 à 4 pour chacun." action={<Link className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-xs text-muted hover:bg-white hover:text-brand" href="/participants">← Participants</Link>} />
      <ScreenTabs
        className={segmentedTabs}
        label="Panneau du bilan" value={view} onChange={setView}
        tabs={[{ value: 'meter', label: 'Baromètre' }, { value: 'people', label: 'Humeurs de l’équipe' }]} />
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)] items-stretch gap-4 max-[800px]:grid-cols-[minmax(0,1fr)] max-[650px]:gap-2" data-view={view}>
        <MoodMeter mobileVisible={view === 'meter'} className={view === 'meter' ? '' : 'max-[800px]:hidden'} />
        <MoodCheckin className={view === 'people' ? '' : 'max-[800px]:hidden'} />
      </div>
    </div>
  );
}