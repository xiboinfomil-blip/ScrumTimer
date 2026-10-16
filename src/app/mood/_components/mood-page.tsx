'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ScreenTabs } from '@/components/ui/screen-tabs';
import { segmentedTabs } from '@/components/ui/styles';
import { useTeam } from '@/providers/team-provider';
import { useStepGuard } from '@/hooks/use-step-guard';
import { MoodMeter } from './mood-meter';
import { MoodCheckin } from './mood-checkin';
import { MoodIcon } from './mood-icon';
import { useViewMotion } from '@/hooks/use-view-motion';

export function MoodPage() {
  const allowed = useStepGuard('mood');
  const { activeTeamId } = useTeam();
  const [view, setView] = useState<'meter' | 'people'>('meter');
  const panels = useViewMotion(view);
  if (!allowed) return null;
  return (
    <div id="mood-page" className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-3 text-ink max-[650px]:gap-2 [@media(max-height:650px)]:gap-2">
      <header className="flex shrink-0 items-center justify-between gap-3 px-1">
        <div className="min-w-0"><p className="mb-1 flex items-center gap-2 text-xs font-semibold text-brand"><span aria-hidden="true" className="size-2 rounded-full bg-accent" />Étape 2 sur 3 · Les humeurs</p><h1 className="text-3xl font-bold tracking-tight text-ink max-[650px]:text-xl [@media(max-height:650px)]:text-xl">Comment va l’équipe ?</h1><p className="mt-1 text-sm text-muted max-[650px]:text-xs">Un instant pour soi, un repère pour l’équipe.</p></div>
        <Link href={`/participants?team=${activeTeamId}`} aria-label="Retour aux participants" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 text-xs font-semibold text-muted hover:border-brand/30 hover:bg-blue-50 hover:text-brand"><MoodIcon name="back" /><span className="max-[650px]:sr-only">Participants</span></Link>
      </header>
      <ScreenTabs
        className={`${segmentedTabs} h-13 border border-slate-200/70 p-1 [&>button]:min-h-11`}
        label="Panneau du bilan" value={view} onChange={setView}
        tabs={[{ value: 'meter', label: 'Baromètre' }, { value: 'people', label: 'Humeurs de l’équipe' }]} />
      <div ref={panels} className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)] items-stretch gap-4 max-[800px]:grid-cols-[minmax(0,1fr)] max-[650px]:gap-2" data-view={view}>
        <MoodMeter mobileVisible={view === 'meter'} onShowPeople={() => setView('people')} className={view === 'meter' ? '' : 'max-[800px]:hidden'} />
        <MoodCheckin className={view === 'people' ? '' : 'max-[800px]:hidden'} />
      </div>
    </div>
  );
}