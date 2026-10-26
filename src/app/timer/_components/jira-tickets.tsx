'use client';

import { useState } from 'react';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LoginIcon from '@mui/icons-material/Login';
import { useJiraResource } from '@/hooks/use-jira-resource';
import type { JiraTicket } from '@/lib/jira';
import { secondaryButton } from '@/components/ui/styles';

export function JiraTickets({ teamId, participantId }: { teamId: string | null; participantId?: string | null }) {
  const resource = useJiraResource<{ name: string; tickets: JiraTicket[] }>(teamId && participantId ? `/api/jira?action=tickets&participantId=${encodeURIComponent(participantId)}` : null, teamId);
  const [page, setPage] = useState(0); const pageSize = 5;
  const count = resource.data?.tickets.length ?? 0; const pages = Math.max(1, Math.ceil(count / pageSize)); const current = Math.min(page, pages - 1);
  return <section aria-labelledby="jira-tickets-heading" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line pb-2">
      <div className="min-w-0"><h2 id="jira-tickets-heading" className="text-lg font-semibold text-ink">Tickets Jira</h2><p className="break-words text-[11px] text-muted">{resource.data?.name ?? ''}</p></div>
      <button type="button" onClick={resource.retry} disabled={resource.loading || !participantId} className={`${secondaryButton} size-11 p-0`} aria-label="Actualiser les tickets Jira" title="Actualiser les tickets Jira"><RefreshIcon fontSize="small" /></button>
    </div>
    {!participantId && <p className="text-xs text-muted">Aucun intervenant sélectionné.</p>}
    {resource.loading && <p role="status" className="text-xs text-muted">Chargement des tickets…</p>}
    {resource.error && <div role="alert" className="text-xs text-danger">{resource.error}<button type="button" className={`${secondaryButton} mt-2 w-full`} onClick={resource.retry}><RefreshIcon fontSize="small" />Réessayer</button>
      {resource.status === 401 && <form method="post" action="/api/jira/login"><button type="submit" className={`${secondaryButton} mt-2 w-full`}><LoginIcon fontSize="small" />Se reconnecter à Jira</button></form>}
    </div>}
    {resource.data && !count && <p role="status" className="text-xs text-muted">Aucun ticket attribué à cet intervenant dans ce sprint.</p>}
    {!!count && <>
      <ul className="flex min-h-0 min-w-0 flex-1 list-none flex-col divide-y divide-line overflow-y-auto overscroll-contain">
        {resource.data!.tickets.slice(current * pageSize, (current + 1) * pageSize).map(ticket => <li key={ticket.id} className="min-w-0 py-3">
          <a href={ticket.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="flex min-h-11 min-w-0 items-start justify-between gap-2 text-xs font-semibold text-brand hover:underline" aria-label={`${ticket.key} : ${ticket.summary} · Ouvrir dans Jira`}>
            <span className="min-w-0"><span className="block text-[10px] font-bold">{ticket.key}</span><span className="mt-1 block break-words text-sm font-medium text-ink">{ticket.summary}</span></span><OpenInNewIcon className="mt-1 shrink-0" sx={{ fontSize: 16 }} />
          </a>
          <p className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted"><span className="break-words rounded bg-blue-50 px-2 py-1 text-brand">{ticket.status}</span>{ticket.priority && <span className="break-words py-1">{ticket.priority}</span>}</p>
        </li>)}
      </ul>
      <nav aria-label="Pagination des tickets Jira" className="flex h-11 shrink-0 items-center justify-between gap-2 border-t border-line pt-1">
        <button type="button" className={`${secondaryButton} size-11 p-0`} disabled={!current} onClick={() => setPage(current - 1)} aria-label="Tickets précédents" title="Tickets précédents"><ArrowBackIcon fontSize="small" /></button>
        <p role="status" className="text-[11px] tabular-nums text-muted">{current + 1} / {pages} · {count} tickets</p>
        <button type="button" className={`${secondaryButton} size-11 p-0`} disabled={current === pages - 1} onClick={() => setPage(current + 1)} aria-label="Tickets suivants" title="Tickets suivants"><ArrowForwardIcon fontSize="small" /></button>
      </nav>
    </>}
  </section>;
}