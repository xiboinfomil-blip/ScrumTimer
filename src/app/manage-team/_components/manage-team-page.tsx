'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, IconButton, InputBase, Paper } from '@mui/material';
import { useTeam } from '@/providers/team-provider';
import { useNotify } from '@/providers/notification-provider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DeleteTeamButton } from '@/components/ui/delete-team-button';
import { PaginatedList } from '@/components/ui/paginated-list';
import { NavIcon } from '@/components/layout/nav-icon';
import { AddPersonForm } from '@/app/participants/_components/add-person-form';
import { EditPersonDialog } from '@/app/participants/_components/edit-person-dialog';
import { ParticipantIcon } from '@/app/participants/_components/participant-icon';
import { validatePersonName } from '@/lib/action-validation';

export function ManageTeamPage() {
  const { state, activeTeamName, activeTeamId, updateTeam } = useTeam();
  const notify = useNotify();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const filtered = state.roster.filter(person => person.name.toLocaleLowerCase('fr-FR').includes(query.trim().toLocaleLowerCase('fr-FR')));
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
  return <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-3 [@media(max-height:650px)]:[&>header]:flex-nowrap [@media(max-height:650px)]:[&>header]:p-3 [@media(max-height:650px)]:[&>header_p:last-child]:hidden [@media(max-height:650px)]:[&>header_h1]:text-base [@media(max-height:650px)]:[&>header_a_span:last-child]:hidden [@media(max-height:650px)]:[&_section]:gap-1" aria-labelledby="manage-team-heading">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-white p-4 max-[650px]:flex-nowrap max-[650px]:p-3"><div className="min-w-0"><p className="text-[10px] font-bold tracking-widest text-brand uppercase max-[650px]:text-[9px]">Gestion de l’équipe</p><h1 id="manage-team-heading" className="mt-1 truncate text-xl font-bold text-ink max-[650px]:text-base" title={activeTeamName}>{activeTeamName}</h1><p className="mt-1 text-xs text-muted max-[650px]:hidden">{state.roster.length} membre{state.roster.length === 1 ? '' : 's'} · Ajoutez, renommez et organisez votre équipe.</p></div><Button component={Link} href={`/teams?team=${activeTeamId}`} aria-label="Toutes les équipes" sx={{ minHeight: 44, minWidth: 44, flexShrink: 0, textTransform: 'none', fontSize: 12 }}><span aria-hidden="true">←</span><span className="ml-2 max-[650px]:hidden">Toutes les équipes</span></Button></header>
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden flex-col gap-3 rounded-2xl border border-line bg-blue-50/40 p-5 lg:flex"><span aria-hidden="true" className="grid size-11 place-items-center rounded-xl bg-white text-brand"><NavIcon name="people" /></span><h2 className="text-base font-bold text-ink">Une équipe bien préparée.</h2><p className="text-xs leading-relaxed text-muted">Les membres sont partagés avec tous les appareils de votre équipe.</p><p className="text-xs leading-relaxed text-muted">Au quotidien, utilisez Participants pour indiquer uniquement les présences et les absences.</p><div className="mt-auto rounded-xl border border-brand/10 bg-white p-3 text-[11px] leading-relaxed text-muted">Retirer un membre ne supprime pas ses résultats déjà archivés.</div></aside>
      <Paper component="section" elevation={0} aria-label="Gérer les membres" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-2xl border border-line bg-white p-4 max-[650px]:gap-1 max-[650px]:p-2.5 [&>.checkin-list]:min-h-18">
        <AddPersonForm />
        <label htmlFor="member-search" className="sr-only">Rechercher un membre</label><InputBase id="member-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher un membre…" startAdornment={<NavIcon name="search" className="mr-2 text-muted" />} sx={{ minHeight: 44, fontSize: 12, px: 1.5, flexShrink: 0 }} className="rounded-xl border border-line bg-slate-50 focus-within:ring-2 focus-within:ring-brand/20" />
        <div className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-slate-50 px-1 text-xs"><label className="flex min-h-11 items-center"><Checkbox size="small" sx={{ minHeight: 44 }} checked={filtered.length > 0 && filtered.every(person => selected.has(person.id))} indeterminate={filtered.some(person => selected.has(person.id)) && !filtered.every(person => selected.has(person.id))} disabled={!filtered.length} onChange={event => { const next = new Set(selected); filtered.forEach(person => { if (event.target.checked) next.add(person.id); else next.delete(person.id); }); setSelected(next); }} />Tout sélectionner</label><Button color="error" disabled={!selectedIds.length} aria-label="Supprimer la sélection" onClick={() => setDeleting(selectedIds)} sx={{ ml: 'auto', minHeight: 44, minWidth: 0, px: 1, fontSize: 11, textTransform: 'none' }}>Supprimer{selectedIds.length ? ` (${selectedIds.length})` : ''}</Button></div>
        {filtered.length ? <PaginatedList items={filtered} renderItem={person => <li key={person.id} className={`flex h-14 shrink-0 items-center gap-1 rounded-xl border px-1 ${selected.has(person.id) ? 'border-brand/25 bg-blue-50' : 'border-line bg-white'}`}><Checkbox size="small" sx={{ minHeight: 44, width: 36 }} slotProps={{ input: { 'aria-label': `Sélectionner ${person.name}` } }} checked={selected.has(person.id)} onChange={() => setSelected(current => { const next = new Set(current); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return next; })} /><strong className="min-w-0 flex-1 truncate text-[13px] text-ink" title={person.name}>{person.name}</strong><IconButton aria-label={`Modifier le nom de ${person.name}`} title="Modifier le nom" sx={{ width: 44, height: 44 }} onClick={() => setEditing(person.id)}><ParticipantIcon name="edit" /></IconButton><IconButton aria-label={`Retirer ${person.name} de l’équipe`} title="Retirer de l’équipe" sx={{ width: 44, height: 44 }} className="text-muted hover:bg-danger-soft hover:text-danger" onClick={() => setDeleting([person.id])}><ParticipantIcon name="trash" /></IconButton></li>} /> : <div className="grid min-h-20 flex-1 place-content-center gap-2 p-3 text-center"><p className="text-sm font-semibold text-ink">{query ? 'Aucun membre trouvé.' : 'Votre équipe prend forme ici.'}</p><p className="text-xs text-muted">{query ? 'Essayez un autre nom.' : 'Ajoutez votre premier membre pour préparer le point.'}</p></div>}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line pt-2"><span className="text-[10px] text-muted max-[1100px]:hidden">Les modifications sont enregistrées dans Neon.</span><DeleteTeamButton /><Button component={Link} href={`/participants?team=${activeTeamId}`} variant="contained" disableElevation sx={{ minHeight: 44, minWidth: 0, textTransform: 'none', fontSize: 12, borderRadius: '12px' }} className="max-[650px]:grow">Confirmer les présences →</Button></div>
      </Paper>
    </div>
    {editingPerson && <EditPersonDialog key={editingPerson.id} person={editingPerson} onSave={saveName} onClose={() => setEditing(null)} />}
    <ConfirmDialog open={deleting.length > 0} title={deleting.length === 1 ? 'Supprimer cette personne ?' : 'Supprimer les personnes sélectionnées ?'} description={`${deleting.length} personne(s) seront retirées de l’équipe avec leurs présences et humeurs. Les bilans archivés sont conservés.`} confirmLabel="Supprimer" danger onClose={() => setDeleting([])} onConfirm={remove} />
  </div>;
}