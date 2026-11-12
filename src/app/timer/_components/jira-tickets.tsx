'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader } from '@infomil/scrum-shared/ui';
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
import CloseRounded from '@mui/icons-material/CloseRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { Button, Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import { useJiraResource } from '@/hooks/jira/use-jira-resource';
import type { JiraStatusCategory, JiraTicket, JiraTicketDetails } from '@/lib/jira/jira';
import { secondaryButton } from '@/components/ui/styles';
import { useViewMotion } from '@/hooks/motion/use-view-motion';

type TicketData = { name: string; tickets: JiraTicket[] };

export function JiraTickets({ teamId, participantId }: { teamId: string | null; participantId?: string | null }) {
  const [status, setStatus] = useState<JiraStatusCategory>('indeterminate');
  const resource = useJiraResource<TicketData>(teamId ? `/api/jira?action=tickets&scope=board&status=${status}` : null, teamId);
  return <TicketList key={participantId ?? 'none'} teamId={teamId} resource={resource} participantId={participantId} status={status} onStatus={setStatus} />;
}

function TicketList({ teamId, resource, participantId, status, onStatus }: { teamId: string | null; resource: ReturnType<typeof useJiraResource<TicketData>>; participantId?: string | null; status: JiraStatusCategory; onStatus: (status: JiraStatusCategory) => void }) {
  const [page, setPage] = useState(0); const pageSize = 5;
  const [selected, setSelected] = useState<JiraTicket | null>(null);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(!participantId);
  const listMotion = useViewMotion(`${page}-${status}-${all}`);
  const scoped = (resource.data?.tickets ?? []).filter(ticket => all || !!participantId && `jira:${ticket.assigneeId}` === participantId);
  const tickets = scoped.filter(ticket => `${ticket.key} ${ticket.summary} ${ticket.status} ${ticket.assigneeName ?? ''}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')));
  const count = tickets.length; const pages = Math.max(1, Math.ceil(count / pageSize)); const current = Math.min(page, pages - 1);
  return <section aria-labelledby="jira-tickets-heading" aria-busy={resource.loading} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line pb-2">
      <div className="min-w-0"><h2 id="jira-tickets-heading" className="flex items-center gap-2 text-sm font-bold text-ink"><AssignmentOutlinedIcon className="text-brand" fontSize="small" />Tickets Jira<span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] tabular-nums text-muted">{resource.data ? count : '—'}</span></h2><p className="mt-1 truncate text-xs text-muted" title={resource.data?.name}>{resource.data?.name ?? ''}</p></div>
      <button type="button" onClick={resource.retry} disabled={resource.loading} className={`${secondaryButton} size-11 p-0`} aria-label="Actualiser les tickets Jira" title="Actualiser les tickets Jira"><RefreshIcon fontSize="small" /></button>
    </div>
    <div className="grid shrink-0 grid-cols-2 gap-2">
      <label className="grid min-w-0 gap-1 text-[11px] font-semibold text-muted">Statut<select aria-label="Statut des tickets Jira" value={status} onChange={event => { onStatus(event.target.value as JiraStatusCategory); setPage(0); }} className="min-h-11 min-w-0 rounded-md border border-control bg-white px-2 text-xs font-semibold text-ink"><option value="new">À faire</option><option value="indeterminate">En cours</option><option value="done">Terminés</option></select></label>
      <label className="grid min-w-0 gap-1 text-[11px] font-semibold text-muted">Attribution<select aria-label="Filtrer les tickets Jira" value={all ? 'all' : 'speaker'} onChange={event => { setAll(event.target.value === 'all'); setPage(0); }} className="min-h-11 min-w-0 rounded-md border border-control bg-white px-2 text-xs font-semibold text-ink"><option value="speaker" disabled={!participantId}>Intervenant</option><option value="all">Tout le tableau</option></select></label>
    </div>
    {resource.loading && <div className="grid min-h-0 flex-1 place-items-center overflow-hidden py-2"><Loader size="sm" label="Chargement des tickets…" /></div>}
    {resource.error && <div role="alert" className="text-xs text-danger">{resource.error}<button type="button" className={`${secondaryButton} mt-2 w-full`} onClick={resource.retry}><RefreshIcon fontSize="small" />Réessayer</button>
      {resource.status === 401 && <form method="post" action="/api/jira/login"><button type="submit" className={`${secondaryButton} mt-2 w-full`}><LoginIcon fontSize="small" />Se reconnecter à Jira</button></form>}
    </div>}
    {resource.data && resource.data.tickets.length > 0 && <label className="flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-control bg-white px-3 focus-within:border-brand"><SearchIcon aria-hidden="true" fontSize="small" className="shrink-0 text-muted" /><span className="sr-only">Rechercher un ticket Jira</span><input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Rechercher un ticket…" className="min-h-11 min-w-0 flex-1 bg-transparent text-xs text-ink placeholder:text-muted" /></label>}
    {resource.data && !count && <p role="status" className="py-4 text-sm text-muted">{query ? 'Aucun ticket ne correspond à votre recherche.' : all ? 'Aucun ticket dans ce tableau.' : 'Aucun ticket attribué à cet intervenant dans ce tableau.'}</p>}
    {!!count && <>
      <div ref={listMotion} className="flex min-h-0 flex-1 flex-col"><ul className="flex min-h-0 min-w-0 flex-1 list-none flex-col divide-y divide-line overflow-y-auto overscroll-contain">
        {tickets.slice(current * pageSize, (current + 1) * pageSize).map(ticket => <li key={ticket.id} className="group min-w-0">
          <button type="button" onClick={() => setSelected(ticket)} title={ticket.summary} className="flex min-h-11 w-full min-w-0 cursor-pointer flex-col gap-1.5 rounded-md px-2 py-2.5 text-left text-xs transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-brand motion-reduce:transition-none" aria-label={`${ticket.key} : ${ticket.summary} · Voir le ticket`}>
            <span className="flex w-full min-w-0 items-center gap-2"><span title={ticket.issueType ?? 'Ticket'} className="flex shrink-0 items-center text-brand">{ticket.issueType && /bug|anomalie/i.test(ticket.issueType) ? <BugReportIcon sx={{ fontSize: 17 }} className="text-danger" /> : ticket.issueType && /story|récit/i.test(ticket.issueType) ? <BookmarkIcon sx={{ fontSize: 17 }} className="text-success" /> : <TaskAltIcon sx={{ fontSize: 17 }} />}</span><span className="min-w-0 flex-1 break-all font-semibold text-muted group-hover:text-brand">{ticket.key}</span><ChevronRightRounded aria-hidden="true" className="shrink-0 text-muted" sx={{ fontSize: 18 }} /></span>
            <span className="line-clamp-2 break-words text-sm leading-snug font-semibold text-ink">{ticket.summary}</span>
            {all && <span className="break-words text-[11px] text-muted">{ticket.assigneeName ?? 'Non attribué'}</span>}
            <span className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1"><span className={`max-w-full rounded px-1.5 py-0.5 text-[10px] font-bold break-words uppercase ${ticket.statusCategory === 'done' ? 'bg-[#dcfff1] text-[#216e4e]' : ticket.statusCategory === 'indeterminate' ? 'bg-[#e9f2ff] text-[#0055cc]' : 'bg-[#f1f2f4] text-[#44546f]'}`}>{ticket.status}</span>{ticket.priority && <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted"><KeyboardDoubleArrowUpIcon aria-hidden="true" sx={{ fontSize: 15 }} className={/highest|high|haute|urgent|critique/i.test(ticket.priority) ? 'text-danger' : 'text-muted'} /><span className="break-words">{ticket.priority}</span></span>}</span>
          </button>
        </li>)}
      </ul></div>
      <nav aria-label="Pagination des tickets Jira" className="flex h-11 shrink-0 items-center justify-between gap-2 border-t border-line pt-1">
        <button type="button" className={`${secondaryButton} size-11 p-0`} disabled={!current} onClick={() => setPage(current - 1)} aria-label="Tickets précédents" title="Tickets précédents"><ArrowBackIcon fontSize="small" /></button>
        <p role="status" className="text-[11px] tabular-nums text-muted">{current + 1} / {pages} · {count} tickets</p>
        <button type="button" className={`${secondaryButton} size-11 p-0`} disabled={current === pages - 1} onClick={() => setPage(current + 1)} aria-label="Tickets suivants" title="Tickets suivants"><ArrowForwardIcon fontSize="small" /></button>
      </nav>
    </>}
    {selected && <TicketDialog key={selected.key} ticket={selected} teamId={teamId} onClose={() => setSelected(null)} />}
  </section>;
}

function TicketDialog({ ticket, teamId, onClose }: { ticket: JiraTicket; teamId: string | null; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const resource = useJiraResource<{ ticket: JiraTicketDetails }>(`/api/jira?action=ticket&key=${encodeURIComponent(ticket.key)}`, teamId);
  useEffect(() => { if (!resource.loading) closeButton.current?.focus(); }, [resource.loading]);
  const detail = resource.data?.ticket;
  const date = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('fr', { dateStyle: 'medium' }).format(new Date(value)) : 'Non renseignée';
  const facts = detail ? [
    ['Attribution', detail.assigneeName ?? 'Non attribué'], ['Type', detail.issueType ?? 'Ticket'],
    ['Priorité', detail.priority ?? 'Non renseignée'], ['Rapporteur', detail.reporter ?? 'Non renseigné'],
    ['Échéance', date(detail.dueDate)], ['Mis à jour', date(detail.updated)],
    ...(detail.parent ? [['Parent', detail.parent]] : []),
    ...(detail.components.length ? [['Composants', detail.components.join(', ')]] : []),
  ] : [];
  return <Dialog open onClose={onClose} aria-labelledby="jira-detail-title" fullWidth maxWidth="md" slotProps={{ transition: { onEntered: () => closeButton.current?.focus() }, paper: { sx: { m: { xs: 1.5, sm: 3 }, p: 0, width: { xs: 'calc(100% - 24px)', sm: 'calc(100% - 48px)' }, maxHeight: 'calc(100dvh - 24px)', borderRadius: '8px', overflow: 'hidden', border: '1px solid #dce3e9' } } }}>
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-5 py-2 max-[650px]:px-3">
      <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-muted"><AssignmentOutlinedIcon className="text-brand" fontSize="small" /><span className="break-all text-brand">{ticket.key}</span><span className="h-3 w-px bg-line" />{detail?.issueType ?? ticket.issueType ?? 'Ticket'}</span>
      <IconButton ref={closeButton} autoFocus aria-label="Fermer le ticket" onClick={onClose} sx={{ width: 44, height: 44 }}><CloseRounded fontSize="small" /></IconButton>
    </div>
    <DialogTitle component="h2" id="jira-detail-title" className="px-6! pt-5! pb-4! text-2xl! font-bold! leading-snug! break-words! max-[650px]:px-4! max-[650px]:text-lg!">{detail?.summary ?? ticket.summary}</DialogTitle>
    <DialogContent className="min-h-0! px-6! pb-6! max-[650px]:px-4! max-[650px]:pb-4!">
      {resource.loading ? <div className="grid min-h-48 place-items-center"><Loader label="Chargement du ticket…" /></div> : resource.error ? <div role="alert" className="border-l-2 border-danger py-3 pl-4 text-sm text-danger"><p>{resource.error}</p><Button startIcon={<RefreshIcon />} onClick={resource.retry} sx={{ mt: 1, minHeight: 44 }}>Réessayer</Button>{resource.status === 401 && <form method="post" action="/api/jira/login"><Button type="submit" startIcon={<LoginIcon />}>Se reconnecter à Jira</Button></form>}</div> : detail && <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_220px] gap-6 max-[650px]:grid-cols-1 max-[650px]:gap-5">
        <section aria-labelledby="jira-description-heading" className="min-w-0">
          <h3 id="jira-description-heading" className="mb-3 border-b border-line pb-2 text-xs font-bold text-ink">Description</h3>
          <p className={`whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere] ${detail.description ? 'text-ink' : 'text-muted'}`}>{detail.description || 'Aucune description renseignée.'}</p>
          {!!detail.labels.length && <div className="mt-6 border-t border-line pt-3"><h3 className="mb-2 text-[11px] font-semibold text-muted">Étiquettes</h3><ul className="flex list-none flex-wrap gap-1.5">{detail.labels.map(label => <li key={label} className="max-w-full break-words rounded border border-line bg-slate-50 px-2 py-1 text-[11px] text-muted">{label}</li>)}</ul></div>}
        </section>
        <aside aria-label="Détails du ticket" className="min-w-0 border-l border-line pl-5 max-[650px]:border-t max-[650px]:border-l-0 max-[650px]:pt-4 max-[650px]:pl-0">
          <span className={`inline-block max-w-full break-words rounded px-2 py-1 text-xs font-bold ${detail.statusCategory === 'done' ? 'bg-success-soft text-success' : detail.statusCategory === 'indeterminate' ? 'bg-blue-50 text-brand' : 'bg-slate-100 text-muted'}`}>{detail.status}</span>
          <div className="my-4 flex items-center justify-between gap-3 border-y border-line py-3"><span className="break-words text-xs font-semibold text-muted">{detail.estimate?.label ?? 'Story points'}</span><strong className="shrink-0 text-2xl font-bold tabular-nums text-brand">{detail.estimate?.value ?? '—'}</strong></div>
          {detail.estimateUnavailable && <div role="status" className="mb-4 text-xs leading-relaxed text-muted">Estimation indisponible avec cette connexion Jira.<form method="post" action="/api/jira/login"><Button type="submit" startIcon={<LoginIcon fontSize="small" />} sx={{ minHeight: 44, px: 0, fontSize: 11, textTransform: 'none' }}>Se reconnecter à Jira</Button></form></div>}
          <dl className="grid gap-3 max-[650px]:grid-cols-2">{facts.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[11px] text-muted">{label}</dt><dd className="mt-0.5 break-words text-xs font-semibold leading-relaxed text-ink">{value}</dd></div>)}</dl>
        </aside>
      </div>}
    </DialogContent>
    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-slate-50 px-5 py-2 max-[650px]:px-3"><span className="text-[11px] text-muted">{ticket.key}</span><Button component="a" href={ticket.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" endIcon={<OpenInNewIcon fontSize="small" />} sx={{ minHeight: 44, textTransform: 'none', fontSize: 12, fontWeight: 700 }}>Ouvrir dans Jira</Button></div>
  </Dialog>;
}