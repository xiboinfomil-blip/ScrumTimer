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
import { ClipboardList as AssignmentOutlinedIcon } from 'lucide-react';
import { X as CloseRounded } from 'lucide-react';
import { ChevronRight as ChevronRightRounded } from 'lucide-react';
import { AlignLeft as SubjectRounded } from 'lucide-react';
import { SlidersHorizontal as TuneRounded } from 'lucide-react';
import { ChevronDown, GitBranch } from 'lucide-react';

import { Button, Button as IconButton } from '@/components/ui/button';
import { useJiraResource } from '@/hooks/jira/use-jira-resource';
import { groupJiraTickets, type JiraStatusCategory, type JiraTicket, type JiraTicketDetails } from '@/lib/jira/jira';
import { JiraTicketStatus } from './jira-ticket-status';
import { secondaryButton } from '@/components/ui/styles';
import { useViewMotion } from '@/hooks/motion/use-view-motion';
const TicketDescription = dynamic(() => import('@/components/jira/ticket-description').then(module => module.TicketDescription), {
  loading: () => <Loader size="sm" label="Chargement de la description…" />,
});

type TicketData = { name: string; tickets: JiraTicket[] };

export function JiraTickets({ teamId, participantId, pageScroll = false }: { teamId: string | null; participantId?: string | null; pageScroll?: boolean }) {
  const [status, setStatus] = useState('');
  const resource = useJiraResource<TicketData>(teamId ? '/api/jira?action=tickets&scope=display&status=all' : null, teamId);
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
    <TicketList key={participantId ?? 'none'} teamId={teamId} resource={resource} participantId={participantId} pageScroll={pageScroll} status={status} onStatus={setStatus} />
  </div>;
}

function TicketList({ teamId, resource, participantId, pageScroll, status, onStatus }: { teamId: string | null; resource: ReturnType<typeof useJiraResource<TicketData>>; participantId?: string | null; pageScroll: boolean; status: string; onStatus: (status: string) => void }) {
  const [page, setPage] = useState(0); const pageSize = 5;
  const [selected, setSelected] = useState<JiraTicket | null>(null);
  const [statusTicket, setStatusTicket] = useState<JiraTicket | null>(null);
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const ticketTrigger = useRef<HTMLButtonElement>(null);
  const statusTrigger = useRef<HTMLButtonElement>(null);
  const refreshTrigger = useRef<HTMLButtonElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(!participantId);
  const listMotion = useViewMotion(`${page}-${status}-${all}`);
  const categories: { key: JiraStatusCategory | undefined; label: string }[] = [{ key: 'new', label: 'À faire' }, { key: 'indeterminate', label: 'En cours' }, { key: 'done', label: 'Terminés' }, { key: undefined, label: 'Autres statuts' }];
  const scoped = (resource.data?.tickets ?? []).filter(ticket => all || !!participantId && `jira:${ticket.assigneeId}` === participantId);
  const tickets = scoped.filter(ticket => (!status || ticket.status === status) && `${ticket.key} ${ticket.summary} ${ticket.status} ${ticket.assigneeName ?? ''}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')));
  const groups = groupJiraTickets(resource.data?.tickets ?? [], tickets);
  const count = tickets.length; const pages = Math.max(1, Math.ceil(groups.length / pageSize)); const current = Math.min(page, pages - 1);
  const openTicket = (ticket: JiraTicket, trigger: HTMLButtonElement) => { ticketTrigger.current = trigger; setSelected(ticket); };
  const openStatus = (ticket: JiraTicket, trigger: HTMLButtonElement) => { statusTrigger.current = trigger; setStatusTicket(ticket); };
  return <section aria-labelledby="jira-tickets-heading" aria-busy={resource.loading} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
    <div className={`flex min-h-0 flex-1 flex-col gap-3 ${pageScroll ? '' : 'overflow-y-auto overscroll-contain [scrollbar-gutter:stable]'}`}>
    <div className="flex shrink-0 items-center justify-between gap-2">
      <div className="min-w-0"><h2 id="jira-tickets-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">Tickets Jira<span className="text-xs font-normal tabular-nums text-muted">{resource.data ? count : '—'}</span></h2><p className="mt-0.5 truncate text-xs text-muted" title={resource.data?.name}>{resource.data?.name ?? ''}</p></div>
      <Button ref={refreshTrigger} type="button" onClick={resource.retry} disabled={resource.loading} className="size-11 p-0 text-muted" aria-label="Actualiser les tickets Jira" title="Actualiser les tickets Jira" variant="ghost"><RefreshIcon size={18} /></Button>
    </div>
    {notice && <p ref={noticeRef} tabIndex={-1} role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</p>}
    <div className="grid shrink-0 grid-cols-2 gap-2">
      <label className="grid min-w-0 gap-1 text-[11px] font-medium text-muted">Statut<NativeSelect aria-label="Sous-statut des tickets Jira" value={status} onChange={event => { onStatus(event.target.value); setPage(0); }} className="min-h-11 min-w-0 rounded-md border border-control bg-white px-2 text-xs font-normal text-ink"><option value="">Tous les statuts</option>{categories.map(category => {
        const names = [...new Set((resource.data?.tickets ?? []).filter(ticket => ticket.statusCategory === category.key).map(ticket => ticket.status))].sort((first, second) => first.localeCompare(second, 'fr'));
        return names.length > 0 && <optgroup key={category.label} label={category.label}>{names.map(name => <option key={name} value={name}>{name}</option>)}</optgroup>;
      })}{status && !resource.data?.tickets.some(ticket => ticket.status === status) && <option value={status}>{status}</option>}</NativeSelect></label>
      <label className="grid min-w-0 gap-1 text-[11px] font-medium text-muted">Attribution<NativeSelect aria-label="Filtrer les tickets Jira" value={all ? 'all' : 'speaker'} onChange={event => { setAll(event.target.value === 'all'); setPage(0); }} className="min-h-11 min-w-0 rounded-md border border-control bg-white px-2 text-xs font-normal text-ink"><option value="speaker" disabled={!participantId}>Intervenant</option><option value="all">Tout le tableau</option></NativeSelect></label>
    </div>
    {resource.loading && <div className="grid min-h-0 flex-1 place-items-center overflow-hidden py-2"><Loader size="sm" label="Chargement des tickets…" /></div>}
    {resource.error && <div role="alert" className="text-xs text-danger">{resource.error}<Button type="button" className={`${secondaryButton} mt-2 w-full`} onClick={resource.retry} variant="ghost"><RefreshIcon size={20} />Réessayer</Button>
      {resource.status === 401 && <form method="post" action="/api/jira/login"><Button type="submit" className={`${secondaryButton} mt-2 w-full`} variant="ghost"><LoginIcon size={20} />Se reconnecter à Jira</Button></form>}
    </div>}
    {resource.data && resource.data.tickets.length > 0 && <label className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-control bg-white px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20"><SearchIcon aria-hidden="true" size={18} className="shrink-0 text-muted" /><span className="sr-only">Rechercher un ticket Jira</span><Input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Rechercher un ticket…" className="min-h-11 min-w-0 flex-1 border-0 bg-transparent text-xs text-ink shadow-none placeholder:text-muted focus-visible:border-0 focus-visible:ring-0" /></label>}
    {resource.data && !count && <p role="status" className="py-4 text-sm text-muted">{query || status ? 'Aucun ticket ne correspond à vos filtres.' : all ? 'Aucun ticket dans ce tableau.' : 'Aucun ticket attribué à cet intervenant dans ce tableau.'}</p>}
    {!!count &&
      <div ref={listMotion} className="flex min-w-0 shrink-0 flex-col"><ul className="flex min-w-0 list-none flex-col divide-y divide-line">
        {groups.slice(current * pageSize, (current + 1) * pageSize).map(({ ticket, subtasks, context }) => <li key={ticket.id} className="min-w-0 overflow-hidden py-1">
          {context && <p className="px-2 pt-2 text-[10px] text-muted">Parent affiché pour le contexte · hors filtres</p>}
          <TicketCard ticket={ticket} showAssignee={all || context} onOpen={openTicket} onStatus={openStatus} />
          {subtasks.length > 0 && <details open={expanded.has(ticket.key)} onToggle={event => {
            const open = event.currentTarget.open;
            setExpanded(previous => {
              if (previous.has(ticket.key) === open) return previous;
              const next = new Set(previous);
              if (open) next.add(ticket.key); else next.delete(ticket.key);
              return next;
            });
          }} className="group/subtasks min-w-0 overflow-hidden">
            <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 rounded-md px-2 py-2 text-xs text-muted select-none hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
              <ChevronDown aria-hidden="true" size={16} className="shrink-0 -rotate-90 transition-transform group-open/subtasks:rotate-0 motion-reduce:transition-none" />
              <span className="min-w-0 flex-1">{subtasks.length} sous-tâche{subtasks.length > 1 ? 's' : ''}</span>
              <span className="text-[10px] tabular-nums">{subtasks.filter(item => item.statusCategory === 'done').length}/{subtasks.length} terminées</span>
            </summary>
            <ul className="mb-2 ml-3 flex min-w-0 list-none flex-col divide-y divide-line border-l border-line pl-2">
              {subtasks.map(child => <li key={child.id} className="min-w-0"><TicketCard ticket={child} nested showAssignee={all || context || child.assigneeId !== ticket.assigneeId} onOpen={openTicket} onStatus={openStatus} /></li>)}
            </ul>
          </details>}
        </li>)}
      </ul></div>}
    </div>
      {pages > 1 && <nav aria-label="Pagination des tickets Jira" className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
        <Button type="button" className={`${secondaryButton} size-11 p-0`} disabled={!current} onClick={() => setPage(current - 1)} aria-label="Tickets précédents" title="Tickets précédents" variant="ghost"><ArrowBackIcon size={20} /></Button>
        <p role="status" aria-live="polite" className="min-w-0 text-[11px] tabular-nums text-muted"><span className="block font-semibold text-ink">Page {current + 1} sur {pages}</span><span>{groups.length} groupes · {count} tickets</span></p>
        {current < pages - 1 ? <Button type="button" className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" onClick={() => setPage(current + 1)} aria-label="Tickets suivants" title="Page suivante" variant="ghost">Suivants<ArrowForwardIcon size={20} /></Button> : <span aria-hidden="true" className="flex min-h-11 items-center gap-1.5 px-3 text-xs text-muted">Fin<ArrowForwardIcon size={20} /></span>}
      </nav>}
    {selected && <TicketDialog key={selected.key} ticket={selected} teamId={teamId} onClose={() => setSelected(null)} onRestoreFocus={() => ticketTrigger.current?.focus()} />}
    {statusTicket && <JiraTicketStatus key={statusTicket.key} ticket={statusTicket} teamId={teamId} onClose={() => setStatusTicket(null)} onRestoreFocus={() => { if (statusTrigger.current?.isConnected) statusTrigger.current.focus(); else (noticeRef.current ?? refreshTrigger.current)?.focus(); }} onChanged={message => { setStatusTicket(null); setNotice(message); resource.retry(); }} />}
  </section>;
}

function TicketCard({ ticket, nested = false, showAssignee, onOpen, onStatus }: {
  ticket: JiraTicket; nested?: boolean; showAssignee: boolean; onOpen: (ticket: JiraTicket, trigger: HTMLButtonElement) => void; onStatus: (ticket: JiraTicket, trigger: HTMLButtonElement) => void;
}) {
  return <article className="group min-w-0 px-2 py-2">
    <Button type="button" onClick={event => onOpen(ticket, event.currentTarget)} title={ticket.summary} className="flex h-auto min-h-11 w-full min-w-0 flex-col items-start justify-start gap-1 whitespace-normal rounded-md p-0 text-left hover:bg-transparent focus-visible:outline-2 focus-visible:outline-brand" aria-label={`${ticket.key} : ${ticket.summary} · Voir le ticket`} variant="ghost">
      <span className="flex w-full min-w-0 items-center gap-1.5"><span title={ticket.issueType ?? 'Ticket'} className="flex shrink-0 items-center text-brand">{ticket.subtask ? <GitBranch size={14} /> : ticket.issueType && /bug|anomalie/i.test(ticket.issueType) ? <BugReportIcon size={14} className="text-danger" /> : ticket.issueType && /story|récit/i.test(ticket.issueType) ? <BookmarkIcon size={14} className="text-success" /> : <TaskAltIcon size={14} />}</span><span className="min-w-0 flex-1 break-all text-[11px] font-normal text-muted group-hover:text-brand">{ticket.key}</span><ChevronRightRounded aria-hidden="true" className="shrink-0 text-muted" size={14} /></span>
      <span className="line-clamp-2 text-sm leading-snug font-medium text-ink [overflow-wrap:anywhere] group-hover:text-brand">{ticket.summary}</span>
    </Button>
    {!nested && ticket.subtask && ticket.parent && <p className="mt-1 break-all text-[10px] text-muted">Sous-tâche de {ticket.parent}</p>}
    <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <Button type="button" variant="ghost" onClick={event => onStatus(ticket, event.currentTarget)} aria-label={`Changer le statut de ${ticket.key} (${ticket.status})`} aria-haspopup="dialog" title="Changer le statut" className={`min-h-11 max-w-full shrink gap-1.5 whitespace-normal rounded-md px-2 text-left text-[11px] font-medium ${ticket.statusCategory === 'done' ? 'bg-[#dcfff1] text-[#216e4e] hover:bg-emerald-100' : ticket.statusCategory === 'indeterminate' ? 'bg-[#e9f2ff] text-[#0055cc] hover:bg-blue-100' : 'bg-[#f1f2f4] text-[#44546f] hover:bg-slate-200'}`}><span className="min-w-0 [overflow-wrap:anywhere]">{ticket.status}</span><ChevronDown aria-hidden="true" size={14} /></Button>
      {showAssignee && <span className="min-w-0 text-[11px] text-muted [overflow-wrap:anywhere]">{ticket.assigneeName ?? 'Non attribué'}</span>}
    </div>
  </article>;
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
    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-white px-5 py-2 max-[650px]:px-3"><Button asChild variant="ghost" className="min-h-[44px] normal-case text-[12px] font-[700]"><a href={ticket.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Ouvrir dans Jira<OpenInNewIcon size={20} /></a></Button></div>
  </DialogContent></Dialog>;
}