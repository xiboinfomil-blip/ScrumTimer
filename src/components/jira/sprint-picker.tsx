'use client';

import { useEffect } from 'react';
import { Loader } from '@infomil/scrum-shared/ui';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useJiraResource } from '@/hooks/jira/use-jira-resource';
import type { JiraOption, JiraSprintSelection } from '@/lib/jira/jira';
import { field, secondaryButton } from '@/components/ui/styles';

export function SprintPicker({ value, onChange, disabled = false, connected = true, fixedBoard = false }: { value: JiraSprintSelection; onChange: (selection: JiraSprintSelection) => void; disabled?: boolean; connected?: boolean; fixedBoard?: boolean }) {
  const sites = useJiraResource<{ options: JiraOption[] }>(connected && !fixedBoard ? '/api/jira?action=sites' : null);
  const cloudId = fixedBoard ? value.cloudId : connected ? sites.data?.options[0]?.id ?? '' : '';
  useEffect(() => {
    if (!fixedBoard && !disabled && value.cloudId !== cloudId) onChange({ cloudId, boardId: 0, sprintId: 0 });
  }, [cloudId, disabled, fixedBoard, onChange, value.cloudId]);
  const boards = useJiraResource<{ options: JiraOption[] }>(connected && cloudId && !fixedBoard ? `/api/jira?action=boards&cloudId=${encodeURIComponent(cloudId)}` : null);
  const sprints = useJiraResource<{ options: JiraOption[] }>(connected && cloudId && value.cloudId === cloudId && value.boardId ? `/api/jira?action=sprints&cloudId=${encodeURIComponent(cloudId)}&boardId=${value.boardId}` : null);
  const resources = [boards, sprints];
  const labels = ['Tableau Scrum', 'Sprint actif'];
  const values = [String(value.boardId || ''), String(value.sprintId || '')];
  const change = (index: number, selected: string) => onChange(index === 0 ? { cloudId, boardId: Number(selected), sprintId: 0 } : { ...value, sprintId: Number(selected) });
  return <fieldset disabled={disabled || !connected} className="flex min-w-0 flex-col gap-3" aria-label="Sprint Jira">
    {!fixedBoard && sites.loading && <Loader size="text" label="Chargement du site Jira…" className="self-start" />}
    {!fixedBoard && !sites.loading && sites.data?.options.length === 0 && <p role="status" className="text-xs text-muted">Aucun site Jira accessible.</p>}
    {!fixedBoard && sites.error && <div role="alert" className="text-xs text-danger">{sites.error}<button type="button" onClick={sites.retry} className={`${secondaryButton} mt-1 w-full`}><RefreshIcon fontSize="small" />Réessayer</button></div>}
    {resources.map((resource, index) => fixedBoard && index === 0 ? null : <div key={labels[index]} className="flex min-w-0 flex-col gap-1">
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-ink">{labels[index]}
        <select aria-label={labels[index]} className={`${field} min-h-11 w-full rounded-lg`} value={values[index]} disabled={disabled || !connected || resource.loading || !resource.data?.options.length} onChange={event => change(index, event.target.value)}>
          <option value="">{resource.loading ? 'Chargement…' : resource.data?.options.length === 0 ? index === 1 ? 'Aucun sprint actif' : 'Aucun résultat' : 'Choisir…'}</option>
          {resource.data?.options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </label>
      {resource.error && <div role="alert" className="text-xs text-danger">{resource.error}<button type="button" onClick={resource.retry} className={`${secondaryButton} mt-1 w-full`}><RefreshIcon fontSize="small" />Réessayer</button></div>}
    </div>)}
  </fieldset>;
}