'use client';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';


import { RefreshCw as RefreshIcon } from 'lucide-react';
import { useJiraResource } from '@/hooks/jira/use-jira-resource';
import type { JiraDisplaySelection, JiraOption } from '@/lib/jira/jira';
import { field, secondaryButton } from '@/components/ui/styles';

export function JiraDisplayPicker({ cloudId, boardId, value, onChange, disabled = false }: { cloudId: string; boardId: number; value?: JiraDisplaySelection; onChange: (value: JiraDisplaySelection) => void; disabled?: boolean }) {
  const boards = useJiraResource<{ options: JiraOption[] }>(cloudId ? `/api/jira?action=boards&cloudId=${encodeURIComponent(cloudId)}&display=1` : null);
  const display = value ?? { boardId, scope: 'board' };
  return <fieldset disabled={disabled || !cloudId} className="flex min-w-0 flex-col gap-3 border-t border-line pt-3">
    <legend className="text-xs font-semibold text-ink">Tickets Jira</legend>
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-ink">Tableau<NativeSelect aria-label="Tableau Jira à afficher" className={`${field} min-h-11 w-full rounded-lg`} disabled={boards.loading || !boards.data?.options.length} value={display.boardId || ''} onChange={event => onChange({ ...display, boardId: Number(event.target.value) })}><option value="" disabled>{boards.loading ? 'Chargement…' : 'Choisir…'}</option>{boards.data?.options.map(board => <option key={board.id} value={board.id}>{board.name}</option>)}</NativeSelect></label>
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-ink">Vue<NativeSelect aria-label="Vue du tableau Jira" className={`${field} min-h-11 w-full rounded-lg`} value={display.scope} onChange={event => onChange({ ...display, boardId: display.boardId || boardId, scope: event.target.value as JiraDisplaySelection['scope'] })}><option value="board">Tableau complet</option><option value="backlog">Backlog</option></NativeSelect></label>
    </div>
    {boards.error && <div role="alert" className="text-xs text-danger">{boards.error}<Button type="button" className={`${secondaryButton} mt-1 w-full`} onClick={boards.retry} variant="ghost"><RefreshIcon size={20} />Recharger les tableaux</Button></div>}
    {!boards.loading && boards.data?.options.length === 0 && <p role="status" className="text-xs text-muted">Aucun tableau accessible.</p>}
  </fieldset>;
}