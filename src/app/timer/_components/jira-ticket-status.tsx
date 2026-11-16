'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { useJiraResource } from '@/hooks/jira/use-jira-resource';
import { jiraResourceCache } from '@/lib/jira/jira-resource-cache';
import type { JiraTicket, JiraTransition } from '@/lib/jira/jira';

export function JiraTicketStatus({ ticket, teamId, onClose, onChanged, onRestoreFocus }: {
  ticket: JiraTicket; teamId: string | null; onClose: () => void; onChanged: (message: string) => void; onRestoreFocus: () => void;
}) {
  const resource = useJiraResource<{ transitions: JiraTransition[] }>(`/api/jira?action=transitions&key=${encodeURIComponent(ticket.key)}`, teamId);
  const [transitionId, setTransitionId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const selected = resource.data?.transitions.find(item => item.id === transitionId);

  async function save() {
    if (!selected || saving) return;
    setSaving(true); setError('');
    controller.current = new AbortController();
    try {
      const response = await fetch('/api/jira', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(teamId ? { 'X-Team-Id': teamId } : {}) },
        body: JSON.stringify({ action: 'transition', key: ticket.key, transitionId: selected.id }),
        signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(60_000)]),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Le changement de statut a échoué.');
      jiraResourceCache.clear();
      onChanged(`${ticket.key} : statut changé vers « ${body.status} ».`);
    } catch (failure) {
      if (controller.current?.signal.aborted) return;
      setError(failure instanceof Error && failure.name !== 'TypeError' && failure.name !== 'TimeoutError'
        ? failure.message : 'Réponse Jira indisponible. Actualisez le ticket avant de réessayer : le statut a peut-être déjà changé.');
    } finally { setSaving(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent showCloseButton={false} className="w-[calc(100%-24px)] max-w-md gap-4 rounded-lg p-5" aria-describedby="jira-status-description" onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus(); }}>
      <div className="min-w-0"><p className="mb-2 text-xs text-muted">{ticket.key}</p><DialogTitle>Changer le statut</DialogTitle></div>
      <p id="jira-status-description" className="break-words text-sm leading-relaxed text-muted">{ticket.summary}<span className="mt-2 block text-xs">Statut actuel : <strong className="text-ink">{ticket.status}</strong></span></p>
      {resource.loading && <p role="status" className="text-sm text-muted">Chargement des transitions autorisées…</p>}
      {resource.error && <div role="alert" className="text-sm text-danger">{resource.error}<Button variant="outline" onClick={resource.retry} className="mt-3 min-h-11"><RefreshCw size={16} />Réessayer</Button>
        {(resource.status === 401 || resource.status === 403) && <form method="post" action="/api/jira/login"><Button type="submit" variant="outline" className="mt-2 min-h-11">Se reconnecter à Jira</Button></form>}
      </div>}
      {resource.data && (resource.data.transitions.length ? <label className="grid min-w-0 gap-2 text-xs font-semibold text-ink">Nouveau statut
        <NativeSelect value={transitionId} disabled={saving} onChange={event => { setTransitionId(event.target.value); setError(''); }} className="min-h-11 w-full min-w-0 rounded-lg border border-control bg-white px-3 text-sm">
          <option value="">Choisir une transition…</option>
          {resource.data.transitions.map(item => <option key={item.id} value={item.id}>{item.status} — {item.name}{item.requiresFields ? ' (dans Jira)' : ''}</option>)}
        </NativeSelect>
      </label> : <p role="status" className="rounded-lg bg-slate-50 p-3 text-sm text-muted">Aucune transition disponible avec vos droits Jira.</p>)}
      {selected?.requiresFields && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Des champs supplémentaires sont requis. Complétez cette transition dans Jira.</p>}
      {error && <p role="alert" className="break-words text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button variant="outline" disabled={saving} onClick={onClose} className="min-h-11">Annuler</Button>
        {selected?.requiresFields || resource.data?.transitions.length === 0 ? <Button asChild className="min-h-11"><a href={ticket.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Ouvrir dans Jira<ExternalLink size={16} /></a></Button>
          : <Button disabled={!selected || saving} onClick={() => void save()} className="min-h-11">{saving ? 'Modification…' : 'Appliquer'}</Button>}
      </div>
    </DialogContent>
  </Dialog>;
}
