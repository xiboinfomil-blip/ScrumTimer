'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Checkbox, IconButton } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useTeam } from '@/providers/team-provider';
import { useNotify } from '@/providers/notification-provider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DeleteTeamButton } from '@/components/ui/delete-team-button';
import { ParticipantLinkButton } from '@/components/ui/participant-link-button';
import { PaginatedList } from '@/components/ui/paginated-list';
import { NavIcon } from '@/components/layout/nav-icon';
import { AddPersonForm } from '@/app/participants/_components/add-person-form';
import { EditPersonDialog } from '@/app/participants/_components/edit-person-dialog';
import { ParticipantIcon } from '@/app/participants/_components/participant-icon';
import { validatePersonName } from '@/lib/action-validation';

const searchable = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');

export function ManageTeamPage() {
  const { state, activeTeamName, activeTeamId, updateTeam, cloudStatus } = useTeam();
  const notify = useNotify();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const filtered = state.roster.filter(person => searchable(person.name).includes(searchable(query.trim())));
  const editingPerson = state.roster.find(person => person.id === editing);
  const selectedIds = state.roster.filter(person => selected.has(person.id)).map(person => person.id);
  function remove() {
    if (updateTeam(current => ({ ...current, session: [], roster: current.roster.filter(person => !deleting.includes(person.id)) }))) {
      setSelected(new Set()); notify('Membres supprimés de l’équipe.');
    }
  }
  function saveName(id: string, name: string): string | null {
    const error = validatePersonName(name);
    if (error) return error;
    if (!state.roster.some(person => person.id === id)) return 'Cette personne ne fait plus partie de l’équipe.';
    if (!updateTeam(current => ({ ...current, session: [], roster: current.roster.map(person => person.id === id ? { ...person, name: name.trim() } : person) }))) return 'Modification impossible. Vérifiez la connexion et les sauvegardes.';
    notify('Nom du participant modifié.'); return null;
  }
  return <div className="mx-auto flex min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto pb-3" aria-labelledby="manage-team-heading">
    <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-3 pb-1">
      <div className="min-w-0 flex-1 basis-56">
        <Link href={`/teams?team=${activeTeamId}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-[11px] font-medium text-brand hover:text-brand-dark"><ArrowBackIcon className="size-3.5" fontSize="inherit" aria-hidden="true" />Toutes les équipes</Link>
        <div className="flex flex-wrap items-center gap-3"><h1 id="manage-team-heading" className="min-w-0 text-2xl font-bold tracking-tight wrap-anywhere text-ink">{activeTeamName}</h1><span className="rounded-md border border-line bg-slate-50 px-2 py-0.5 text-[10px] text-muted">{state.roster.length} membre{state.roster.length === 1 ? '' : 's'}</span></div>
      </div>
      <Link href={`/participants?team=${activeTeamId}`} className="group inline-flex min-h-11 items-center justify-center gap-3 rounded-lg bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-dark max-sm:w-full">Confirmer les présences<ArrowForwardIcon aria-hidden="true" fontSize="inherit" className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1" /></Link>
    </header>
    <div className="grid shrink-0 items-start gap-5 lg:grid-cols-[minmax(0,2.05fr)_minmax(260px,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
      <section aria-label="Gérer les membres" className="flex h-[min(680px,calc(100dvh-300px))] min-h-112 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-white">
        <div className="shrink-0">
          <div className="flex min-h-17 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">Membres<span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-brand">{state.roster.length}<span className="sr-only"> membres</span></span></h2>
            <span className={`inline-flex items-center gap-1 text-[10px] ${cloudStatus === 'saved' ? 'text-success' : 'text-muted'}`}><NavIcon name={cloudStatus === 'saved' ? 'check' : 'cloud'} width="13" height="13" />{cloudStatus === 'saved' ? 'Modifications enregistrées' : cloudStatus === 'error' ? 'Sauvegarde à vérifier' : 'Synchronisation…'}</span>
          </div>
          <div className="px-4 pt-4 sm:px-5 [&_.add-person_.MuiInputBase-root]:rounded-lg [&_.add-person_.MuiInputBase-root]:bg-slate-50/60 [&_.add-person_button]:rounded-lg">
          <h3 className="mb-2 text-[11px] font-medium text-ink">Ajouter un membre</h3>
          <AddPersonForm />
          </div>
        </div>
        <div className="shrink-0 px-4 pt-3 sm:px-5">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-slate-50/60 px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/10">
            <NavIcon name="search" className="shrink-0 text-muted" width="16" height="16" />
            <label htmlFor="member-search" className="sr-only">Rechercher un membre</label>
            <input id="member-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher un membre…" className="min-h-11 min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted focus-visible:outline-none" />
          </div>
          <div className="mt-1 flex min-h-11 flex-wrap items-center justify-between gap-x-2 text-xs">
            <label className="flex min-h-11 items-center text-muted"><Checkbox size="small" sx={{ minHeight: 44, width: 44 }} checked={filtered.length > 0 && filtered.every(person => selected.has(person.id))} indeterminate={filtered.some(person => selected.has(person.id)) && !filtered.every(person => selected.has(person.id))} disabled={!filtered.length} onChange={event => { const next = new Set(selected); filtered.forEach(person => { if (event.target.checked) next.add(person.id); else next.delete(person.id); }); setSelected(next); }} />Tout sélectionner</label>
            {selectedIds.length ? <button type="button" aria-label="Supprimer la sélection" onClick={() => setDeleting(selectedIds)} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-danger hover:bg-danger-soft">Supprimer ({selectedIds.length})</button> : <span role="status" aria-live="polite" className="px-2 text-muted">{filtered.length} sur {state.roster.length}</span>}
          </div>
          <p role="status" aria-live="polite" className="sr-only">{selectedIds.length ? `${selectedIds.length} membre(s) sélectionné(s).` : ''}</p>
        </div>
        <div className="flex min-h-40 flex-1 flex-col border-t border-slate-100 px-2 pb-2 sm:px-3 [&_.checkin-list]:gap-0 [&_.checkin-list]:mt-0">
          {filtered.length ? <PaginatedList key={query} items={filtered} renderItem={person => <li key={person.id} className={`group flex h-14 shrink-0 items-center gap-1 rounded-lg border px-1 ${selected.has(person.id) ? 'border-brand/25 bg-blue-50' : 'border-transparent bg-white hover:border-line hover:bg-slate-50'}`}>
            <Checkbox size="small" sx={{ height: 44, width: 44, flexShrink: 0 }} slotProps={{ input: { 'aria-label': `Sélectionner ${person.name}` } }} checked={selected.has(person.id)} onChange={() => setSelected(current => { const next = new Set(current); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return next; })} />
            <span aria-hidden="true" className="mr-2 grid size-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-xs font-semibold text-brand max-[380px]:hidden">{Array.from(person.name)[0]?.toLocaleUpperCase('fr-FR')}</span>
            <strong className="min-w-0 flex-1 truncate text-xs font-medium text-ink" title={person.name}>{person.name}</strong>
            <IconButton aria-label={`Modifier le nom de ${person.name}`} title="Modifier le nom" sx={{ width: 44, height: 44, flexShrink: 0 }} className="text-muted hover:bg-blue-50 hover:text-brand" onClick={() => setEditing(person.id)}><ParticipantIcon name="edit" /></IconButton>
            <IconButton aria-label={`Retirer ${person.name} de l’équipe`} title="Retirer de l’équipe" sx={{ width: 44, height: 44, flexShrink: 0 }} className="text-muted hover:bg-danger-soft hover:text-danger" onClick={() => setDeleting([person.id])}><ParticipantIcon name="trash" /></IconButton>
          </li>} /> : <div className="grid min-h-48 flex-1 place-content-center justify-items-center gap-2 px-4 py-6 text-center motion-safe:animate-enter">
            <span aria-hidden="true" className="mb-1 grid size-11 place-items-center rounded-2xl bg-blue-50 text-brand"><NavIcon name={query ? 'search' : 'people'} /></span>
            <p className="text-sm font-semibold text-ink">{query ? 'Aucun membre trouvé.' : 'Votre équipe prend forme ici.'}</p>
            <p className="max-w-64 text-xs leading-relaxed text-muted">{query ? 'Essayez un autre nom ou effacez la recherche.' : 'Ajoutez votre premier membre pour préparer le point.'}</p>
            <button type="button" onClick={() => { if (query) setQuery(''); else document.getElementById('checkin-name')?.focus(); }} className="mt-1 min-h-11 rounded-xl px-3 text-sm font-semibold text-brand hover:bg-blue-50">{query ? 'Effacer la recherche' : 'Ajouter le premier membre'}<ArrowForwardIcon aria-hidden="true" fontSize="inherit" className="ml-2 size-4" /></button>
          </div>}
        </div>
        <p className="flex shrink-0 items-start gap-2 border-t border-line bg-slate-50/70 px-4 py-3 text-[10px] leading-relaxed text-muted sm:px-5"><NavIcon name="help" width="13" height="13" className="mt-0.5 shrink-0" />Retirer un membre conserve ses bilans déjà archivés.</p>
      </section>
      <details className="group rounded-xl border border-line bg-white">
        <summary className="flex min-h-12 list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-[10px] font-medium text-ink uppercase hover:bg-slate-50 [&::-webkit-details-marker]:hidden">Suppression de l’équipe<NavIcon name="chevron" width="16" height="16" className="shrink-0 group-open:rotate-180 motion-safe:transition-transform" /></summary>
        <div className="border-t border-line px-4 py-3 motion-safe:animate-enter"><p className="mb-2 text-xs leading-relaxed text-muted">Supprime l’espace et ses données pour tous les appareils. Cette action est irréversible.</p><DeleteTeamButton /></div>
      </details>
      </div>
      <aside className="flex min-w-0 flex-col gap-3" aria-label="Espace et accès de l’équipe">
        <section className="relative isolate overflow-hidden rounded-xl border border-blue-300/30 bg-linear-to-br from-brand to-brand-dark p-5 text-white" aria-labelledby="team-access-heading">
          <span aria-hidden="true" className="pointer-events-none absolute -top-12 -right-12 -z-10 size-48 rounded-full border border-white/10 bg-white/5" />
          <span aria-hidden="true" className="pointer-events-none absolute -top-8 -right-16 -z-10 size-40 rounded-full bg-white/5" />
          <span aria-hidden="true" className="mb-4 grid size-9 place-items-center rounded-lg border border-white/10 bg-white/15 text-blue-100"><NavIcon name="people" width="19" height="19" /></span>
          <h2 id="team-access-heading" className="text-sm font-bold">Un espace à partager</h2>
          <p className="mt-2 text-xs leading-relaxed text-blue-100">Donnez à votre équipe accès aux notes, aux statistiques et aux bilans en direct.</p>
          <div className="mt-4 flex rounded-lg bg-white px-1 [&_button]:w-full"><ParticipantLinkButton key={activeTeamId} /></div>
          <p className="mt-3 text-[10px] leading-relaxed text-blue-100">Lien réservé à votre équipe. Il permet aussi de modifier les notes partagées instantanément.</p>
        </section>
        <section className="flex items-start gap-3 rounded-xl border border-line bg-white p-4" aria-labelledby="team-daily-heading">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg border border-emerald-100 bg-emerald-50 text-success"><NavIcon name="check" width="16" height="16" /></span>
          <div><h2 id="team-daily-heading" className="text-[11px] font-semibold text-ink">Et pour le point du jour ?</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">La liste des membres reste partagée entre les appareils. Indiquez les présences et les absences dans Participants, sans retirer de membres.</p></div>
        </section>
      </aside>
    </div>
    {editingPerson && <EditPersonDialog key={editingPerson.id} person={editingPerson} onSave={saveName} onClose={() => setEditing(null)} />}
    <ConfirmDialog open={deleting.length > 0} title={deleting.length === 1 ? 'Supprimer cette personne ?' : 'Supprimer les personnes sélectionnées ?'} description={`${deleting.length} personne(s) seront retirées de l’équipe avec leurs présences et humeurs. Les bilans archivés sont conservés.`} confirmLabel="Supprimer" danger onClose={() => setDeleting([])} onConfirm={remove} />
  </div>;
}