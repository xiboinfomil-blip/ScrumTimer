'use client';

import { useState } from 'react';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LoginIcon from '@mui/icons-material/Login';
import SearchIcon from '@mui/icons-material/Search';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import BugReportIcon from '@mui/icons-material/BugReport';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import KeyboardDoubleArrowUpIcon from '@mui/icons-material/KeyboardDoubleArrowUp';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import { useJiraResource } from '@/hooks/use-jira-resource';
import type { JiraTicket } from '@/lib/jira';
import { secondaryButton } from '@/components/ui/styles';

type TicketData = { name: string; tickets: JiraTicket[] };

export function JiraTickets({ teamId, participantId }: { teamId: string | null; participantId?: string | null }) {
  const resource = useJiraResource<TicketData>(teamId ? '/api/jira?action=tickets&scope=board' : null, teamId);
  return <TicketList key={participantId ?? 'none'} resource={resource} participantId={participantId} />;
}

function TicketList({ resource, participantId }: { resource: ReturnType<typeof useJiraResource<TicketData>>; participantId?: string | null }) {
  const [page, setPage] = useState(0); const pageSize = 5;
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(!participantId);
  const scoped = (resource.data?.tickets ?? []).filter(ticket => all || !!participantId && `jira:${ticket.assigneeId}` === participantId);
  const tickets = scoped.filter(ticket => `${ticket.key} ${ticket.summary} ${ticket.status} ${ticket.assigneeName ?? ''}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')));
  const count = tickets.length; const pages = Math.max(1, Math.ceil(count / pageSize)); const current = Math.min(page, pages - 1);
  return <section aria-labelledby="jira-tickets-heading" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line pb-2">
      <div className="min-w-0"><h2 id="jira-tickets-heading" className="flex items-center gap-2 text-base font-semibold text-ink"><AssignmentOutlinedIcon className="text-brand" fontSize="small" />Tickets Jira<span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] tabular-nums text-muted">{resource.data ? scoped.length : '—'}</span></h2><p className="mt-1 break-words text-xs text-muted">{resource.data?.name ?? ''}</p></div>
      <button type="button" onClick={resource.retry} disabled={resource.loading} className={`${secondaryButton} size-11 p-0`} aria-label="Actualiser les tickets Jira" title="Actualiser les tickets Jira"><RefreshIcon fontSize="small" /></button>
    </div>
    <div role="group" aria-label="Filtrer les tickets Jira" className="flex min-h-11 shrink-0 gap-1 rounded-md bg-slate-100 p-1">
      {([false, true] as const).map(value => <button key={String(value)} type="button" aria-pressed={all === value} disabled={!value && !participantId} onClick={() => { setAll(value); setPage(0); }} className={`min-h-11 min-w-0 flex-1 rounded px-2 text-xs font-semibold disabled:opacity-50 ${all === value ? 'bg-white text-brand shadow-xs' : 'text-muted hover:bg-white/60'}`}>{value ? 'Tout le tableau' : 'Intervenant'}</button>)}
    </div>
    {resource.loading && <div role="status" className="min-h-0 overflow-hidden"><span className="sr-only">Chargement des tickets…</span>{[0, 1, 2].map(row => <div key={row} aria-hidden="true" className="space-y-2 border-b border-line py-4 motion-safe:animate-pulse"><div className="h-3 w-20 rounded bg-slate-200" /><div className="h-4 w-5/6 rounded bg-slate-100" /><div className="h-5 w-24 rounded bg-slate-100" /></div>)}</div>}
    {resource.error && <div role="alert" className="text-xs text-danger">{resource.error}<button type="button" className={`${secondaryButton} mt-2 w-full`} onClick={resource.retry}><RefreshIcon fontSize="small" />Réessayer</button>
      {resource.status === 401 && <form method="post" action="/api/jira/login"><button type="submit" className={`${secondaryButton} mt-2 w-full`}><LoginIcon fontSize="small" />Se reconnecter à Jira</button></form>}
    </div>}
    {resource.data && resource.data.tickets.length > 0 && <label className="flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-line bg-white px-3 focus-within:border-brand"><SearchIcon aria-hidden="true" fontSize="small" className="shrink-0 text-muted" /><span className="sr-only">Rechercher un ticket Jira</span><input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Rechercher un ticket…" className="min-h-11 min-w-0 flex-1 bg-transparent text-xs text-ink placeholder:text-muted" /></label>}
    {resource.data && !count && <p role="status" className="py-4 text-sm text-muted">{query ? 'Aucun ticket ne correspond à votre recherche.' : all ? 'Aucun ticket dans ce tableau.' : 'Aucun ticket attribué à cet intervenant dans ce tableau.'}</p>}
    {!!count && <>
      <ul className="flex min-h-0 min-w-0 flex-1 list-none flex-col divide-y divide-line overflow-y-auto overscroll-contain">
        {tickets.slice(current * pageSize, (current + 1) * pageSize).map(ticket => <li key={ticket.id} className="group min-w-0">
          <a href={ticket.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="flex min-h-11 min-w-0 flex-col gap-2 rounded-md px-2 py-3 text-xs transition-colors hover:bg-[#f1f4f8]" aria-label={`${ticket.key} : ${ticket.summary} · Ouvrir dans Jira`}>
            <span className="flex w-full min-w-0 items-center gap-2"><span title={ticket.issueType ?? 'Ticket'} className="flex shrink-0 items-center text-brand">{ticket.issueType && /bug|anomalie/i.test(ticket.issueType) ? <BugReportIcon sx={{ fontSize: 17 }} className="text-danger" /> : ticket.issueType && /story|récit/i.test(ticket.issueType) ? <BookmarkIcon sx={{ fontSize: 17 }} className="text-success" /> : <TaskAltIcon sx={{ fontSize: 17 }} />}</span><span className="min-w-0 flex-1 break-all font-semibold text-muted group-hover:text-brand">{ticket.key}</span><OpenInNewIcon aria-hidden="true" className="shrink-0 text-muted" sx={{ fontSize: 15 }} /></span>
            <span className="block break-words text-sm leading-relaxed font-medium text-ink">{ticket.summary}</span>
            {all && <span className="break-words text-[11px] text-muted">{ticket.assigneeName ?? 'Non attribué'}</span>}
            <span className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1"><span className={`max-w-full rounded px-1.5 py-0.5 text-[10px] font-bold break-words uppercase ${ticket.statusCategory === 'done' ? 'bg-[#dcfff1] text-[#216e4e]' : ticket.statusCategory === 'indeterminate' ? 'bg-[#e9f2ff] text-[#0055cc]' : 'bg-[#f1f2f4] text-[#44546f]'}`}>{ticket.status}</span>{ticket.priority && <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted"><KeyboardDoubleArrowUpIcon aria-hidden="true" sx={{ fontSize: 15 }} className={/highest|high|haute|urgent|critique/i.test(ticket.priority) ? 'text-danger' : 'text-muted'} /><span className="break-words">{ticket.priority}</span></span>}</span>
          </a>
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