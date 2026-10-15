'use client';

import { useState } from 'react';
import { ScreenTabs } from '@/components/ui/screen-tabs';
import { WorkflowHeading } from '@/components/ui/workflow-heading';
import { routeStage, segmentedTabs } from '@/components/ui/styles';
import { useStandupTimer } from '@/hooks/use-standup-timer';
import { useStepGuard } from '@/hooks/use-step-guard';
import { DailyPrompts } from './daily-prompts';
import { TeamLineup } from './team-lineup';
import { TimerPanel } from './timer-panel';
import { SessionResults } from './session-results';
import { TimerManagementDialog } from './timer-management-dialog';

export type StandupTimer = ReturnType<typeof useStandupTimer>;

export function TimerPage() {
  const allowed = useStepGuard('timer');
  const timer = useStandupTimer();
  const [view, setView] = useState<'timer' | 'team' | 'prompts'>('timer');

  if (!allowed) return null;
  if (timer.people.length > 0 && !timer.activeId && timer.people.every(person => person.done)) return <SessionResults timer={timer} />;

  const perPerson = timer.duration % 60
    ? `${Math.floor(timer.duration / 60)} min ${timer.duration % 60} s`
    : `${timer.duration / 60} min`;

  return (
    <div id="timer-page" className={`${routeStage} mx-auto w-full max-w-6xl overflow-hidden max-[650px]:[&>section:first-child_.MuiAvatar-root]:hidden max-[650px]:[&_h1]:text-lg`} data-mode={timer.focusMode ? 'speaking' : 'setup'}>
      <WorkflowHeading step={3} title={timer.focusMode ? 'On vous écoute' : 'À chacun son tour'} description={<span id="overview-people" className="[@media(max-height:650px)]:hidden">{timer.focusMode ? `${timer.people.filter(person => person.done).length} / ${timer.people.length} passages terminés · Suivant démarre le prochain.` : `${timer.people.length} personnes · ${perPerson} chacun · Réglez, puis démarrez.`}</span>} action={<span id="meeting-estimate" className="shrink-0 text-xs text-muted max-[650px]:hidden">≈ {Math.ceil(timer.people.length * timer.duration / 60)} min</span>} />
      {!timer.focusMode && <ScreenTabs
        className={`${segmentedTabs} h-13 border border-slate-200/70 p-1 [&>button]:min-h-11`}
        label="Panneau du minuteur"
        value={view}
        onChange={setView}
        tabs={[
          { value: 'timer', label: 'Minuteur' },
          { value: 'team', label: 'Participants' },
          { value: 'prompts', label: 'Questions' },
        ]}
      />}
      <div className={`workspace grid min-h-0 min-w-0 flex-1 items-stretch gap-3 overflow-hidden ${timer.focusMode ? 'grid-cols-[minmax(0,1fr)_210px] max-[800px]:grid-cols-1' : 'grid-cols-[200px_minmax(0,1fr)_190px] min-[1100px]:grid-cols-[240px_minmax(0,1fr)_210px] max-[800px]:grid-cols-[minmax(0,1fr)]'}`} data-view={timer.focusMode ? 'timer' : view}>
        {!timer.focusMode && <TeamLineup timer={timer} className={view !== 'team' ? 'max-[800px]:hidden' : ''} />}
        <TimerPanel timer={timer} className={!timer.focusMode && view !== 'timer' ? 'max-[800px]:hidden' : ''} />
        <DailyPrompts className={timer.focusMode || view !== 'prompts' ? 'max-[800px]:hidden' : ''} />
      </div>
      <TimerManagementDialog timer={timer} />
    </div>
  );
}