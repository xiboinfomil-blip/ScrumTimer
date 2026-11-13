'use client';
import { Button } from '@/components/ui/button';


import { useState } from 'react';
import { Loader } from '@infomil/scrum-shared/ui';
import { RefreshCw as RefreshIcon } from 'lucide-react';
import { Save as SaveOutlinedIcon } from 'lucide-react';
import { LogIn as LoginIcon } from 'lucide-react';
import { useTeam } from '@/providers/team-provider';
import { useJiraResource } from '@/hooks/jira/use-jira-resource';
import { SprintPicker } from '@/components/jira/sprint-picker';
import { JiraDisplayPicker } from '@/components/jira/display-picker';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { primaryButton, secondaryButton } from '@/components/ui/styles';
import type { JiraSprintSelection } from '@/lib/jira/jira';
import { jiraResourceCache } from '@/lib/jira/jira-resource-cache';
import { cloudFetch } from '@/lib/persistence/cloud-retry';

type Sprint = JiraSprintSelection & { name: string };
export function SprintManagement() {
  const { activeTeamId } = useTeam();
  const resource = useJiraResource<{ sprint: Sprint | null }>(activeTeamId ? '/api/jira?action=team' : null, activeTeamId);
  return <section className="flex min-w-0 flex-col gap-3 border-b border-line pb-4" aria-labelledby="jira-sprint-heading">
    <h2 id="jira-sprint-heading" className="text-sm font-semibold text-ink">Sprint Jira</h2>
    {resource.loading && <Loader size="sm" label="Chargement du sprint…" className="self-center" />}
    {resource.error && <div role="alert" className="text-xs text-danger">{resource.error}<Button type="button" className={`${secondaryButton} mt-2`} onClick={resource.retry} variant="ghost"><RefreshIcon size={20} />Réessayer</Button></div>}
    {resource.data?.sprint && <SprintForm key={activeTeamId} sprint={resource.data.sprint} onSaved={resource.retry} />}
    <form method="post" action="/api/jira/login"><Button type="submit" className={secondaryButton} variant="ghost"><LoginIcon size={20} />Reconnecter Jira</Button></form>
  </section>;
}
function SprintForm({ sprint, onSaved }: { sprint: Sprint; onSaved: () => void }) {
  const { activeTeamId, state, ready, teamBusy, cloudStatus, syncSprint, getTimerCheckpoint } = useTeam();
  const [selection, setSelection] = useState<JiraSprintSelection>({ cloudId: sprint.cloudId, boardId: sprint.boardId, sprintId: sprint.sprintId });
  const [display, setDisplay] = useState(sprint.display ?? { boardId: sprint.boardId, scope: 'board' as const });
  const [savedDisplay, setSavedDisplay] = useState(display);
  const [confirm, setConfirm] = useState(false); const [pending, setPending] = useState(false); const [notice, setNotice] = useState('');
  const locked = !!state.session.length || !!getTimerCheckpoint()?.session.length;
  const disabled = locked || pending || teamBusy || !ready || cloudStatus !== 'saved';
  const displayDisabled = pending || teamBusy || !ready || cloudStatus !== 'saved';
  async function saveDisplay() {
    if (!activeTeamId || displayDisabled) return;
    setPending(true); setNotice('');
    try {
      const response = await cloudFetch('/api/jira', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Team-Id': activeTeamId }, body: JSON.stringify({ display }) });
      if (!response.ok) throw new Error('Affichage non enregistré. Vérifiez vos droits Jira et réessayez.');
      jiraResourceCache.clear(); setSavedDisplay(display); setNotice('Affichage enregistré.');
    } catch { setNotice('Affichage non enregistré. Vérifiez vos droits Jira et réessayez.'); }
    finally { setPending(false); }
  }
  async function sync() {
    setPending(true); setNotice('');
    const success = await syncSprint(selection);
    if (success) { jiraResourceCache.clear(); onSaved(); }
    else setNotice('Synchronisation non confirmée. Vérifiez la connexion Jira et les sauvegardes.');
    setPending(false);
  }
  return <>
    <p className="break-words text-xs font-medium text-brand">{sprint.name}</p>
    <SprintPicker value={selection} onChange={setSelection} disabled={disabled} fixedBoard />
    {locked && <p role="status" className="text-xs text-muted">Point préparé · Synchronisation verrouillée</p>}
    <Button type="button" disabled={disabled || !selection.sprintId} className={primaryButton} onClick={() => setConfirm(true)} variant="ghost"><RefreshIcon size={20} />{pending ? 'Synchronisation…' : 'Synchroniser les participants'}</Button>
    <JiraDisplayPicker cloudId={sprint.cloudId} boardId={sprint.boardId} value={display} onChange={setDisplay} disabled={displayDisabled} />
    <Button type="button" disabled={displayDisabled || display.boardId === savedDisplay.boardId && display.scope === savedDisplay.scope} className={secondaryButton} onClick={() => void saveDisplay()} variant="ghost"><SaveOutlinedIcon size={20} />Enregistrer l’affichage</Button>
    {notice && <p role="status" className="text-xs text-muted">{notice}</p>}
    <ConfirmDialog open={confirm} title="Synchroniser le sprint Jira ?" description="La liste des participants sera remplacée par les responsables des tickets visibles dans ce sprint. Les humeurs seront effacées. Les bilans archivés seront conservés." confirmLabel="Synchroniser" onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void sync(); }} />
  </>;
}