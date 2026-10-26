'use client';

import { useState } from 'react';
import RefreshIcon from '@mui/icons-material/Refresh';
import LoginIcon from '@mui/icons-material/Login';
import { useTeam } from '@/providers/team-provider';
import { useJiraResource } from '@/hooks/use-jira-resource';
import { SprintPicker } from '@/components/jira/sprint-picker';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { primaryButton, secondaryButton } from '@/components/ui/styles';
import type { JiraSprintSelection } from '@/lib/jira';

type Sprint = JiraSprintSelection & { name: string };
export function SprintManagement() {
  const { activeTeamId } = useTeam();
  const resource = useJiraResource<{ sprint: Sprint | null }>(activeTeamId ? '/api/jira?action=team' : null, activeTeamId);
  return <section className="flex min-w-0 flex-col gap-3 border-b border-line pb-4" aria-labelledby="jira-sprint-heading">
    <h2 id="jira-sprint-heading" className="text-sm font-semibold text-ink">Sprint Jira</h2>
    {resource.loading && <p role="status" className="text-xs text-muted">Chargement du sprint…</p>}
    {resource.error && <div role="alert" className="text-xs text-danger">{resource.error}<button type="button" className={`${secondaryButton} mt-2`} onClick={resource.retry}><RefreshIcon fontSize="small" />Réessayer</button></div>}
    {resource.data?.sprint && <SprintForm key={activeTeamId} sprint={resource.data.sprint} onSaved={resource.retry} />}
    <form method="post" action="/api/jira/login"><button type="submit" className={secondaryButton}><LoginIcon fontSize="small" />Reconnecter Jira</button></form>
  </section>;
}
function SprintForm({ sprint, onSaved }: { sprint: Sprint; onSaved: () => void }) {
  const { state, ready, teamBusy, cloudStatus, syncSprint, getTimerCheckpoint } = useTeam();
  const [selection, setSelection] = useState<JiraSprintSelection>({ cloudId: sprint.cloudId, boardId: sprint.boardId, sprintId: sprint.sprintId });
  const [confirm, setConfirm] = useState(false); const [pending, setPending] = useState(false); const [notice, setNotice] = useState('');
  const locked = !!state.session.length || !!getTimerCheckpoint()?.session.length;
  const disabled = locked || pending || teamBusy || !ready || cloudStatus !== 'saved';
  async function sync() {
    setPending(true); setNotice('');
    const success = await syncSprint(selection);
    if (success) onSaved();
    else setNotice('Synchronisation non confirmée. Vérifiez la connexion Jira et les sauvegardes.');
    setPending(false);
  }
  return <>
    <p className="break-words text-xs font-medium text-brand">{sprint.name}</p>
    <SprintPicker value={selection} onChange={setSelection} disabled={disabled} fixedBoard />
    {locked && <p role="status" className="text-xs text-muted">Point préparé · Synchronisation verrouillée</p>}
    <button type="button" disabled={disabled || !selection.sprintId} className={primaryButton} onClick={() => setConfirm(true)}><RefreshIcon fontSize="small" />{pending ? 'Synchronisation…' : 'Synchroniser les participants'}</button>
    {notice && <p role="status" className="text-xs text-muted">{notice}</p>}
    <ConfirmDialog open={confirm} title="Synchroniser le sprint Jira ?" description="La liste des participants sera remplacée par les responsables des tickets visibles dans ce sprint. Les humeurs seront effacées. Les bilans archivés seront conservés." confirmLabel="Synchroniser" onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void sync(); }} />
  </>;
}