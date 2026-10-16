'use client';
import { useState } from 'react';
import { button, field, Pagination, Panel, StateScreen } from '@/components/ui';
import { useTeam } from '@/hooks/use-team';
import { pageItems, searchText } from '@/lib/statistics';
import { NoteEditor } from './note-editor';
import { Results } from './results';

export function TeamPortal({ token }: { token: string }) {
  const team = useTeam(token);
  const [tab, setTab] = useState<'notes' | 'statistics' | 'summary'>('notes');
  const [query, setQuery] = useState(''), [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const data = team.data;
  if (!data) {
    if (team.error) return <StateScreen title={team.error.status === 401 ? 'Lien d’équipe invalide' : 'Équipe indisponible'}><p role="alert">{team.error.message}</p><button className={button} disabled={team.loading} onClick={() => void team.refresh()}>Réessayer</button></StateScreen>;
    return <p role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-brand">Chargement de votre équipe…</p>;
  }
  const filtered = data.team.roster.filter(p => searchText(p.name).includes(searchText(query)));
  const list = pageItems(filtered, page);
  return <div className="space-y-6"><section className="relative overflow-hidden rounded-3xl bg-brand p-5 text-white sm:p-8"><div aria-hidden="true" className="absolute -right-10 -top-20 h-56 w-56 rounded-full border-[28px] border-white/5" /><p className="relative text-xs font-bold uppercase tracking-[0.2em] text-blue-100">Un espace, toute l’équipe</p><h1 className="relative mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{data.team.name}</h1><p className="relative mt-3 max-w-xl text-sm leading-relaxed text-blue-50">Préparez vos idées, retrouvez le rythme de l’équipe et consultez le bilan du jour. Simplement, ensemble.</p><div className="relative mt-5 flex flex-wrap gap-2"><span className="rounded-full bg-white/15 px-3 py-2 text-xs">{data.team.roster.length} participants</span><span className="rounded-full bg-white/15 px-3 py-2 text-xs">{team.day} · Maurice</span><span className="rounded-full bg-white/15 px-3 py-2 text-xs">Accès partagé, sans compte</span></div></section>
    <div className="flex flex-wrap items-center justify-between gap-3"><nav aria-label="Vues de l’équipe" className="flex w-full flex-wrap gap-2 sm:w-auto">{([['notes', 'Notes du jour'], ['statistics', 'Statistiques'], ['summary', 'Bilan du jour']] as const).map(([id, label]) => <button key={id} aria-pressed={tab === id} className={`${button} ${tab === id ? 'border-brand bg-blue-50 ring-1 ring-brand' : ''}`} onClick={() => setTab(id)}>{label}</button>)}</nav><button className={button} disabled={team.loading || team.saving} onClick={() => void team.refresh()}>{team.loading ? 'Actualisation…' : 'Actualiser'}</button></div>
    <p role="status" className="sr-only">{team.loading ? 'Actualisation des données.' : 'Données chargées.'}</p>
    {team.error && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{team.error.message} Les données affichées peuvent être anciennes. Vos brouillons sont conservés.</p>}
    {data.day !== team.day && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">Les notes affichées datent du {data.day}. Actualisez pour charger la nouvelle journée. Aucun brouillon n’est transféré automatiquement.</p>}
    <div hidden={tab !== 'notes'}><Panel title="Les idées à ne pas oublier" eyebrow="01 · Notes du jour"><p className="mb-4 text-sm leading-relaxed text-slate-600">Choisissez n’importe quel participant pour écrire sa note. Ce choix n’est pas une connexion personnelle. Les notes sont visibles et modifiables par toute l’équipe jusqu’à minuit à Maurice (UTC+4).</p>
      <label htmlFor="roster-search" className="mb-2 block text-sm font-semibold">Rechercher un participant</label><input id="roster-search" type="search" className={field} placeholder="Un nom dans l’équipe…" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /><p className="my-3 text-xs text-slate-500">{filtered.length} résultat(s) · présents et absents</p>
      {!data.team.roster.length ? <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">L’équipe ne contient aucun participant. Le scrum master peut compléter l’équipe dans son application.</p> : !filtered.length ? <p className="p-4 text-sm text-slate-600">Aucun participant ne correspond à votre recherche.</p> : <ul className="space-y-2">{list.items.map(p => {
        const note = data.hints.find(h => h.participantId === p.id);
        return <li key={p.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3"><span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-brand">{p.name.slice(0, 1).toLocaleUpperCase('fr')}</span><div className="min-w-0 flex-1 basis-24"><p className="font-semibold">{p.name}</p><p className="text-xs text-slate-500">{p.present ? 'Présent' : 'Absent'} · {note ? 'Note partagée' : 'Pas encore de note'}</p>{note && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-slate-600">{note.hint}</p>}</div><button className={button} disabled={!!selected || team.saving || data.day !== team.day || !!team.error} onClick={() => setSelected({ id: p.id, name: p.name })} aria-label={`Écrire une note pour ${p.name}`}>{note ? 'Voir / modifier' : 'Ajouter une note'}</button></li>;
      })}</ul>}
      <Pagination page={list.page} pages={list.pages} onPage={setPage} label="Participants" />
      {selected && <NoteEditor key={selected.id} participant={selected} data={data} day={team.day} saving={team.saving} save={team.save} refresh={team.refresh} onClose={() => setSelected(null)} />}
    </Panel></div>
    <div hidden={tab !== 'statistics'}><Results kind="statistics" data={data} now={team.now} /></div>
    <div hidden={tab !== 'summary'}><Results kind="summary" data={data} now={team.now} /></div>
    <aside className="rounded-2xl border-l-4 border-accent bg-white p-4 text-sm leading-relaxed text-slate-600"><strong className="text-slate-900">Un périmètre volontairement simple.</strong> Ici, seules les notes sont modifiables. Les statistiques et le bilan sont en lecture seule. Les présences, les humeurs, le minuteur et la gestion d’équipe restent dans l’application du scrum master.</aside>
  </div>;
}