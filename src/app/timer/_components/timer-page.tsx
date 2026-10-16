'use client';

import { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useTeam } from '@/providers/team-provider';
import { useLiveBroadcast } from '@/hooks/use-live-broadcast';
import { usePresentation } from '@/hooks/use-presentation';
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
  const reduced = useReducedMotion();
  const allowed = useStepGuard('timer');
  const timer = useStandupTimer();
  const [view, setView] = useState<'timer' | 'team' | 'prompts'>('timer');
  const [sharing, setSharing] = useState(false);
  const { activeTeamId, activeTeamName } = useTeam();
  const target = useRef<HTMLDivElement>(null);
  const presentation = usePresentation(target);
  const index = timer.people.findIndex(person => person.id === timer.activeId);
  const following = [...timer.people.slice(index + 1), ...timer.people.slice(0, Math.max(0, index))].find(person => !person.done && !person.postponed);
  const broadcast = useLiveBroadcast(allowed ? activeTeamId : null, {
    speaker: timer.person?.name ?? '', nextSpeaker: following?.name ?? '', teamName: activeTeamName,
    running: timer.running, remaining: timer.remaining, deadline: timer.deadline,
    completed: timer.people.filter(person => person.done).length, total: timer.people.length,
  });

  if (!allowed) return null;
  if (timer.people.length > 0 && !timer.activeId && timer.people.every(person => person.done)) return <SessionResults timer={timer} />;

  const perPerson = timer.duration % 60
    ? `${Math.floor(timer.duration / 60)} min ${timer.duration % 60} s`
    : `${timer.duration / 60} min`;

  return (
    <motion.div initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : .65, ease: [.22, 1, .36, 1] }} ref={target} id="timer-page" className={`${routeStage} ${presentation.presenting ? 'fixed inset-0 z-[1400] h-dvh max-w-none! bg-white p-3 sm:p-6' : 'mx-auto w-full max-w-6xl'} overflow-hidden max-[650px]:[&>section:first-child_.MuiAvatar-root]:hidden max-[650px]:[&_h1]:text-lg`} data-mode={timer.focusMode ? 'speaking' : 'setup'}>
      <Dialog open={sharing} onClose={() => setSharing(false)} aria-labelledby="sharing-title" fullWidth maxWidth="xs">
        <DialogTitle id="sharing-title">Diffusion et présentation</DialogTitle>
        <DialogContent><div className="flex flex-col items-start gap-2" aria-label="Diffusion et présentation">
        <Button size="small" onClick={broadcast.toggle} aria-pressed={broadcast.enabled} sx={{ minHeight: 44, fontSize: 11 }}>{broadcast.enabled ? 'Arrêter le direct' : 'Diffuser en direct'}</Button>
        <Button size="small" component={Link} href={`/spectator?team=${encodeURIComponent(activeTeamId ?? '')}`} target="_blank" rel="noopener noreferrer" sx={{ minHeight: 44, fontSize: 11 }}>Lien spectateur</Button>
        <Button size="small" onClick={() => { setSharing(false); void presentation.toggle(); }} aria-pressed={presentation.presenting} sx={{ minHeight: 44, fontSize: 11 }}>{presentation.presenting ? 'Quitter la présentation' : 'Présentation'}</Button>
        <span role="status" className="text-[10px] text-muted">{broadcast.enabled ? broadcast.status : presentation.notice}</span>
        </div></DialogContent><DialogActions><Button onClick={() => setSharing(false)}>Fermer</Button></DialogActions>
      </Dialog>
      <WorkflowHeading step={3} title={timer.focusMode ? 'On vous écoute' : 'À chacun son tour'} description={<span id="overview-people" className="[@media(max-height:650px)]:hidden">{timer.focusMode ? `${timer.people.filter(person => person.done).length} / ${timer.people.length} passages terminés · Suivant démarre le prochain.` : `${timer.people.length} personnes · ${perPerson} chacun · Réglez, puis démarrez.`}</span>} action={<Button onClick={() => presentation.presenting ? void presentation.toggle() : setSharing(true)} sx={{ minHeight: 44, minWidth: 0, fontSize: 10 }}>{presentation.presenting ? 'Quitter' : broadcast.enabled ? 'En direct' : 'Diffusion'}</Button>} />
      {!timer.focusMode && !presentation.presenting && <ScreenTabs
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
      <div className={`workspace grid min-h-0 min-w-0 flex-1 items-stretch gap-3 overflow-hidden ${presentation.presenting ? 'grid-cols-1' : timer.focusMode ? 'grid-cols-[minmax(0,1fr)_210px] max-[800px]:grid-cols-1' : 'grid-cols-[200px_minmax(0,1fr)_190px] min-[1100px]:grid-cols-[240px_minmax(0,1fr)_210px] max-[800px]:grid-cols-[minmax(0,1fr)]'}`} data-view={timer.focusMode || presentation.presenting ? 'timer' : view}>
        {!timer.focusMode && !presentation.presenting && <TeamLineup timer={timer} className={view !== 'team' ? 'max-[800px]:hidden' : ''} />}
        <TimerPanel timer={{ ...timer, manage: () => { if (presentation.presenting) void presentation.toggle(); timer.manage(); } }} className={!timer.focusMode && !presentation.presenting && view !== 'timer' ? 'max-[800px]:hidden' : ''} />
        {!presentation.presenting && <DailyPrompts className={timer.focusMode || view !== 'prompts' ? 'max-[800px]:hidden' : ''} />}
      </div>
      <TimerManagementDialog timer={timer} />
    </motion.div>
  );
}