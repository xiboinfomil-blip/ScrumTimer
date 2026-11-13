'use client';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from 'cn';


import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader } from '@infomil/scrum-shared/ui';
import { RefreshCw as RefreshIcon } from 'lucide-react';
import { ExternalLink as OpenInNewIcon } from 'lucide-react';
import { ArrowLeft as ArrowBackIcon } from 'lucide-react';
import { ArrowRight as ArrowForwardIcon } from 'lucide-react';
import { LogIn as LoginIcon } from 'lucide-react';
import { Search as SearchIcon } from 'lucide-react';
import { CircleCheck as TaskAltIcon } from 'lucide-react';
import { Bug as BugReportIcon } from 'lucide-react';
import { Bookmark as BookmarkIcon } from 'lucide-react';
import { ChevronsUp as KeyboardDoubleArrowUpIcon } from 'lucide-react';
import { ClipboardList as AssignmentOutlinedIcon } from 'lucide-react';
import { X as CloseRounded } from 'lucide-react';
import { ChevronRight as ChevronRightRounded } from 'lucide-react';
import { AlignLeft as SubjectRounded } from 'lucide-react';
import { SlidersHorizontal as TuneRounded } from 'lucide-react';
import { LockKeyhole as LockOutlined } from 'lucide-react';

import { Button, Button as IconButton } from '@/components/ui/button';
import { useJiraResource } from '@/hooks/jira/use-jira-resource';
import type { JiraStatusCategory, JiraTicket, JiraTicketDetails } from '@/lib/jira/jira';
import { secondaryButton } from '@/components/ui/styles';
import { useViewMotion } from '@/hooks/motion/use-view-motion';
const TicketDescription = dynamic(() => import('@/components/jira/ticket-description').then(module => module.TicketDescription), {
  loading: () => <Loader size="sm" label="Chargement de la description…" />,
});

type TicketData = { name: string; tickets: JiraTicket[] };

export function JiraTickets({ teamId, participantId }: { teamId: string | null; participantId?: string | null }) {
  const [status, setStatus] = useState('');
  const resource = useJiraResource<TicketData>(teamId ? '/api/jira?action=tickets&scope=display&status=all' : null, teamId);
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
    <TicketList key={participantId ?? 'none'} teamId={teamId} resource={resource} participantId={participantId} status={status} onStatus={setStatus} />
  </div>;
}

function TicketList({ teamId, resource, participantId, status, onStatus }: { teamId: string | null; resource: ReturnType<typeof useJiraResource<TicketData>>; participantId?: string | null; status: string; onStatus: (status: string) => void }) {
  const [page, setPage] = useState(0); const pageSize = 5;
  const [selected, setSelected] = useState<JiraTicket | null>(null);
  const ticketTrigger = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(!participantId);
  const listMotion = useViewMotion(`${page}-${status}-${all}`);
  const categories: { key: JiraStatusCategory | undefined; label: string }[] = [{ key: 'new', label: 'À faire' }, { key: 'indeterminate', label: 'En cours' }, { key: 'done', label: 'Terminés' }, { key: undefined, label: 'Autres statuts' }];
  const scoped = (resource.data?.tickets ?? []).filter(ticket => all || !!participantId && `jira:${ticket.assigneeId}` === participantId);
  const tickets = scoped.filter(ticket => (!status || ticket.status === status) && `${ticket.key} ${ticket.summary} ${ticket.status} ${ticket.assigneeName ?? ''}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')));
  const count = tickets.length; const pages = Math.max(1, Math.ceil(count / pageSize)); const current = Math.min(page, pages - 1);
  return <section aria-labelledby="jira-tickets-heading" aria-busy={resource.loading} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line pb-2">
      <div className="min-w-0"><h2 id="jira-tickets-heading" className="flex items-center gap-2 text-sm font-bold text-ink"><AssignmentOutlinedIcon className="text-brand" size={20} />Tickets Jira<span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] tabular-nums text-muted">{resource.data ? count : '—'}</span></h2><p className="mt-1 truncate text-xs text-muted" title={resource.data?.name}>{resource.data?.name ?? ''}</p></div>
      <Button type="button" onClick={resource.retry} disabled={resource.loading} className={`${secondaryButton} size-11 p-0`} aria-label="Actualiser les tickets Jira" title="Actualiser les tickets Jira" variant="ghost"><RefreshIcon size={20} /></Button>
    </div>
    <div className="grid shrink-0 grid-cols-2 gap-2">
      <label className="grid min-w-0 gap-1 text-[11px] font-semibold text-muted">Sous-statut<NativeSelect aria-label="Sous-statut des tickets Jira" value={status} onChange={event => { onStatus(event.target.value); setPage(0); }} className="min-h-11 min-w-0 rounded-md border border-control bg-white px-2 text-xs font-semibold text-ink"><option value="">Tous les statuts</option>{categories.map(category => {
        const names = [...new Set((resource.data?.tickets ?? []).filter(ticket => ticket.statusCategory === category.key).map(ticket => ticket.status))].sort((first, second) => first.localeCompare(second, 'fr'));
        return names.length > 0 && <optgroup key={category.label} label={category.label}>{names.map(name => <option key={name} value={name}>{name}</option>)}</optgroup>;
      })}</NativeSelect></label>
      <label className="grid min-w-0 gap-1 text-[11px] font-semibold text-muted">Attribution<NativeSelect aria-label="Filtrer les tickets Jira" value={all ? 'all' : 'speaker'} onChange={event => { setAll(event.target.value === 'all'); setPage(0); }} className="min-h-11 min-w-0 rounded-md border border-control bg-white px-2 text-xs font-semibold text-ink"><option value="speaker" disabled={!participantId}>Intervenant</option><option value="all">Tout le tableau</option></NativeSelect></label>
    </div>
    {resource.loading && <div className="grid min-h-0 flex-1 place-items-center overflow-hidden py-2"><Loader size="sm" label="Chargement des tickets…" /></div>}
    {resource.error && <div role="alert" className="text-xs text-danger">{resource.error}<Button type="button" className={`${secondaryButton} mt-2 w-full`} onClick={resource.retry} variant="ghost"><RefreshIcon size={20} />Réessayer</Button>
      {resource.status === 401 && <form method="post" action="/api/jira/login"><Button type="submit" className={`${secondaryButton} mt-2 w-full`} variant="ghost"><LoginIcon size={20} />Se reconnecter à Jira</Button></form>}
    </div>}
    {resource.data && resource.data.tickets.length > 0 && <label className="flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-control bg-white px-3 focus-within:border-brand"><SearchIcon aria-hidden="true" size={20} className="shrink-0 text-muted" /><span className="sr-only">Rechercher un ticket Jira</span><Input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Rechercher un ticket…" className="min-h-11 min-w-0 flex-1 bg-transparent text-xs text-ink placeholder:text-muted" /></label>}
    {resource.data && !count && <p role="status" className="py-4 text-sm text-muted">{query || status ? 'Aucun ticket ne correspond à vos filtres.' : all ? 'Aucun ticket dans ce tableau.' : 'Aucun ticket attribué à cet intervenant dans ce tableau.'}</p>}
    {!!count &&
      <div ref={listMotion} className="flex min-w-0 shrink-0 flex-col"><ul className="flex min-w-0 list-none flex-col divide-y divide-line">
        {tickets.slice(current * pageSize, (current + 1) * pageSize).map(ticket => <li key={ticket.id} className="group min-w-0">
          <Button type="button" onClick={event => { ticketTrigger.current = event.currentTarget; setSelected(ticket); }} title={ticket.summary} className="flex min-h-11 w-full min-w-0 cursor-pointer flex-col gap-1.5 rounded-md px-2 py-2.5 text-left text-xs transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-brand motion-reduce:transition-none" aria-label={`${ticket.key} : ${ticket.summary} · Voir le ticket`} variant="ghost">
            <span className="flex w-full min-w-0 items-center gap-2"><span title={ticket.issueType ?? 'Ticket'} className="flex shrink-0 items-center text-brand">{ticket.issueType && /bug|anomalie/i.test(ticket.issueType) ? <BugReportIcon size={17} className="text-danger" /> : ticket.issueType && /story|récit/i.test(ticket.issueType) ? <BookmarkIcon size={17} className="text-success" /> : <TaskAltIcon size={17} />}</span><span className="min-w-0 flex-1 break-all font-semibold text-muted group-hover:text-brand">{ticket.key}</span><ChevronRightRounded aria-hidden="true" className="shrink-0 text-muted" size={18} /></span>
            <span className="line-clamp-2 break-words text-sm leading-snug font-semibold text-ink">{ticket.summary}</span>
            {all && <span className="break-words text-[11px] text-muted">{ticket.assigneeName ?? 'Non attribué'}</span>}
            <span className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1"><span className={`max-w-full rounded px-1.5 py-0.5 text-[10px] font-bold break-words uppercase ${ticket.statusCategory === 'done' ? 'bg-[#dcfff1] text-[#216e4e]' : ticket.statusCategory === 'indeterminate' ? 'bg-[#e9f2ff] text-[#0055cc]' : 'bg-[#f1f2f4] text-[#44546f]'}`}>{ticket.status}</span>{ticket.priority && <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted"><KeyboardDoubleArrowUpIcon aria-hidden="true" size={15} className={/highest|high|haute|urgent|critique/i.test(ticket.priority) ? 'text-danger' : 'text-muted'} /><span className="break-words">{ticket.priority}</span></span>}</span>
          </Button>
        </li>)}
      </ul></div>}
    </div>
      {pages > 1 && <nav aria-label="Pagination des tickets Jira" className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
        <Button type="button" className={`${secondaryButton} size-11 p-0`} disabled={!current} onClick={() => setPage(current - 1)} aria-label="Tickets précédents" title="Tickets précédents" variant="ghost"><ArrowBackIcon size={20} /></Button>
        <p role="status" aria-live="polite" className="min-w-0 text-[11px] tabular-nums text-muted"><span className="block font-semibold text-ink">Page {current + 1} sur {pages}</span><span>{current * pageSize + 1}–{Math.min((current + 1) * pageSize, count)} sur {count} tickets</span></p>
        {current < pages - 1 ? <Button type="button" className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" onClick={() => setPage(current + 1)} aria-label="Tickets suivants" title="Page suivante" variant="ghost">Suivants<ArrowForwardIcon size={20} /></Button> : <span aria-hidden="true" className="flex min-h-11 items-center gap-1.5 px-3 text-xs text-muted">Fin<ArrowForwardIcon size={20} /></span>}
      </nav>}
    {selected && <TicketDialog key={selected.key} ticket={selected} teamId={teamId} onClose={() => setSelected(null)} onRestoreFocus={() => ticketTrigger.current?.focus()} />}
  </section>;
}

function TicketDialog({ ticket, teamId, onClose, onRestoreFocus }: { ticket: JiraTicket; teamId: string | null; onClose: () => void; onRestoreFocus: () => void }) {
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
  return <Dialog open={true} onOpenChange={next => { if (!next) (onClose)?.(); }}><DialogContent showCloseButton={false} className="min-h-0 p-[0px] w-[calc(100%_-_24px)] sm:w-[calc(100%_-_48px)] max-h-[calc(100dvh_-_24px)] rounded-[8px] overflow-hidden border-[1px_solid_#dce3e9] max-w-[900px]" aria-labelledby="jira-detail-title" onOpenAutoFocus={event => { event.preventDefault(); (() => closeButton.current?.focus())(); }} onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus(); }}>
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-white px-5 py-2 max-[650px]:px-3">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted"><AssignmentOutlinedIcon className="shrink-0 text-brand" size={20} /><span>Tickets</span><ChevronRightRounded className="shrink-0" size={16} /><span className="break-all font-semibold text-brand">{ticket.key}</span><span className="min-w-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] break-words">{detail?.issueType ?? ticket.issueType ?? 'Ticket'}</span></span>
      <IconButton ref={closeButton} autoFocus aria-label="Fermer le ticket" onClick={onClose} variant="ghost" size="icon" className="w-[44px] h-[44px]"><CloseRounded size={20} /></IconButton>
    </div>
    <div data-dialog-body className={cn("min-h-0 overflow-y-auto px-5 py-3", "min-h-0! px-6! pt-5! pb-6! [scrollbar-gutter:stable] max-[650px]:px-4! max-[650px]:pt-4! max-[650px]:pb-4!")}>
      <DialogTitle id="jira-detail-title" className={cn("shrink-0 px-5 pt-5 pb-2", "mb-4! p-0! text-[22px]! font-semibold! leading-snug! [overflow-wrap:anywhere] max-[650px]:text-xl!")}>{detail?.summary ?? ticket.summary}</DialogTitle>
      <div className="mb-6 flex min-w-0 flex-wrap items-center gap-2"><span className={`max-w-full rounded px-2 py-1 text-[11px] font-bold break-words ${ (detail ?? ticket).statusCategory === 'done' ? 'bg-[#dcfff1] text-[#216e4e]' : (detail ?? ticket).statusCategory === 'indeterminate' ? 'bg-[#e9f2ff] text-[#0055cc]' : 'bg-[#f1f2f4] text-[#44546f]'}`}>{detail?.status ?? ticket.status}</span></div>
      {resource.loading ? <div className="grid min-h-48 place-items-center"><Loader label="Chargement du ticket…" /></div> : resource.error ? <div role="alert" className="border-l-2 border-danger py-3 pl-4 text-sm text-danger"><p>{resource.error}</p><Button onClick={resource.retry} variant="ghost" className="mt-[8px] min-h-[44px]"><RefreshIcon />Réessayer</Button>{resource.status === 401 && <form method="post" action="/api/jira/login"><Button type="submit" variant="ghost"><LoginIcon />Se reconnecter à Jira</Button></form>}</div> : detail && <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_220px] gap-6 max-[650px]:grid-cols-1 max-[650px]:gap-5">
        <section className="min-w-0">
          <h3 id="jira-description-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink"><SubjectRounded className="text-muted" size={20} />Description</h3>
          <div role="region" aria-labelledby="jira-description-heading" tabIndex={0} className="max-h-[min(22rem,40dvh)] overflow-y-auto overscroll-contain rounded-sm border border-line bg-white p-3 [scrollbar-gutter:stable] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            <TicketDescription description={detail.description} />
          </div>
          {!!detail.labels.length && <div className="mt-6 border-t border-line pt-3"><h3 className="mb-2 text-[11px] font-semibold text-muted">Étiquettes</h3><ul className="flex list-none flex-wrap gap-1.5">{detail.labels.map(label => <li key={label} className="max-w-full break-words rounded border border-line bg-slate-50 px-2 py-1 text-[11px] text-muted">{label}</li>)}</ul></div>}
        </section>
        <aside aria-label="Détails du ticket" className="min-w-0 border-l border-line pl-5 max-[650px]:border-t max-[650px]:border-l-0 max-[650px]:pt-4 max-[650px]:pl-0">
          <h3 className="mb-4 flex items-center gap-2 text-xs font-bold text-ink"><TuneRounded className="text-brand" size={20} />Détails</h3>
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3"><span className="min-w-0 break-words text-xs text-muted">{detail.estimate?.label ?? 'Story points'}</span><strong className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs font-semibold tabular-nums text-ink">{detail.estimate?.value ?? '—'}</strong></div>
          {detail.estimateUnavailable && <p role="status" className="mb-4 text-xs leading-relaxed text-muted">Estimation indisponible : configuration du tableau inaccessible.</p>}
          <dl className="grid gap-x-4 gap-y-4 max-[650px]:grid-cols-2">{facts.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[11px] text-muted">{label}</dt><dd className="mt-1 text-xs font-semibold leading-relaxed text-ink [overflow-wrap:anywhere]">{value}</dd></div>)}</dl>
        </aside>
      </div>}
    </div>
    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-white px-5 py-2 max-[650px]:px-3"><span className="inline-flex items-center gap-1.5 text-[11px] text-muted"><LockOutlined size={14} />Lecture seule</span><Button asChild variant="ghost" className="min-h-[44px] normal-case text-[12px] font-[700]"><a href={ticket.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Ouvrir dans Jira<OpenInNewIcon size={20} /></a></Button></div>
  </DialogContent></Dialog>;
}