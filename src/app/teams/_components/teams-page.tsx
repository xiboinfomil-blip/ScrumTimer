'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@mui/material';
import { useTeam } from '@/providers/team-provider';
import { NavIcon } from '@/components/layout/nav-icon';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const searchable = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');
const pageSize = 6;
const secondaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-brand hover:border-brand/40 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50';

export function TeamsPage() {
  const { teams, activeTeamId, teamBusy, ready, cloudStatus, switchTeam, createTeam } = useTeam();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const [page, setPage] = useState(0);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const results = teams.filter(team => searchable(team.name).includes(searchable(query.trim())));
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleTeams = results.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const totalMembers = teams.reduce((total, team) => total + team.memberCount, 0);
  const disabled = teamBusy || pending || !ready;
  function changePage(next: number) {
    setPage(next);
    listHeading.current?.focus();
  }
  async function choose(id: string, manage: boolean) {
    if (disabled) return;
    setPending(true); setOpeningId(id); setError('');
    const success = await switchTeam(id);
    setPending(false); setOpeningId(null);
    if (success) router.push(`${manage ? '/manage-team' : '/participants'}?team=${id}`);
    else setError('Changement impossible. Vérifiez la connexion et les sauvegardes en attente.');
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    if (!name.trim() || name.trim().length > 60 || /\p{Cc}/u.test(name)) {
      setCreateError('Choisissez un nom de 1 à 60 caractères, sans caractère de contrôle.');
      nameInput.current?.focus();
      return;
    }
    setPending(true); setCreateError('');
    const success = await createTeam(name.trim());
    setPending(false);
    if (success) router.push(`/manage-team${window.location.search}`);
    else setCreateError('Création impossible. Ce nom existe peut-être déjà ; vérifiez aussi la connexion.');
  }
  return <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-5 overflow-y-auto pb-3" aria-labelledby="teams-heading">
    <header className="flex shrink-0 flex-wrap items-end justify-between gap-4 px-1 pt-2">
      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-brand"><span aria-hidden="true" className="size-2 rounded-full bg-accent" />Le point quotidien, ensemble</p>
        <h1 id="teams-heading" className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Vos équipes<span className="text-accent">.</span></h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">Un espace pour se retrouver. Un moment pour chacun.</p>
      </div>
      <dl className="flex gap-5 text-sm sm:gap-6" aria-label="Vue d’ensemble des équipes">
        <div><dt className="text-xs text-muted">Équipes</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{ready ? teams.length : '—'}</dd></div>
        <div className="border-l border-line pl-5 sm:pl-6"><dt className="text-xs text-muted">Membres au total</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{ready ? totalMembers : '—'}</dd></div>
      </dl>
    </header>

    <div className="grid shrink-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white shadow-sm shadow-brand/3" aria-labelledby="team-list-heading">
        <div className="border-b border-line p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 ref={listHeading} tabIndex={-1} id="team-list-heading" className="rounded text-base font-bold text-ink">Choisir une équipe</h2>
            <span role="status" aria-live="polite" aria-atomic="true" className="text-xs text-muted">{!ready ? 'Chargement…' : `${results.length} résultat${results.length === 1 ? '' : 's'}`}</span>
          </div>
          <div className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-slate-50/80 px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/10">
            <NavIcon name="search" className="shrink-0 text-muted" />
            <label htmlFor="team-page-search" className="sr-only">Rechercher une équipe</label>
            <input id="team-page-search" type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Rechercher par nom…" className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted focus-visible:outline-none" />
          </div>
        </div>
        {error && <Alert severity="error" className="m-4">{error}</Alert>}
        <p role="status" className="sr-only">{pending ? openingId ? 'Ouverture de l’équipe…' : 'Création de l’équipe…' : ''}</p>
        {!ready && cloudStatus !== 'error' ? <PageSkeleton variant="teams" scope="section" className="p-4" /> : !teams.length ? <div className="px-5 py-10 text-center">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-blue-50 text-brand"><NavIcon name="people" /></span>
          <p role="status" className="text-sm font-semibold text-ink">{cloudStatus === 'error' ? 'Équipes indisponibles. Réessayez la connexion Neon.' : 'Votre première équipe commence ici.'}</p>
          {cloudStatus !== 'error' && <><p className="mt-2 text-sm text-muted">Créez son espace, puis invitez chacun à prendre part au point.</p><button type="button" onClick={() => nameInput.current?.focus()} className={`${secondaryButton} mt-4`}>Nommer mon équipe <NavIcon name="plus" /></button></>}
        </div> : !results.length ? <div className="px-5 py-10 text-center motion-safe:animate-enter">
          <NavIcon name="search" className="mx-auto mb-3 text-muted" />
          <p className="text-sm font-semibold text-ink">Aucune équipe trouvée.</p>
          <p className="mt-2 text-sm text-muted">Essayez un autre nom ou créez votre équipe.</p>
          <button type="button" onClick={() => { setQuery(''); setPage(0); }} className={`${secondaryButton} mt-4`}>Effacer la recherche</button>
        </div> : <ul aria-label="Équipes disponibles" aria-busy={pending && openingId !== null} className="list-none divide-y divide-line p-2">
          {visibleTeams.map(team => {
            const active = activeTeamId === team.id;
            return <li key={team.id} className="group grid min-w-0 gap-3 rounded-xl p-3 hover:bg-slate-50 motion-safe:animate-enter sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className={`grid size-11 shrink-0 place-items-center rounded-2xl text-base font-bold ${active ? 'bg-brand text-white shadow-sm shadow-brand/20' : 'bg-blue-50 text-brand'}`}>{Array.from(team.name)[0]?.toLocaleUpperCase('fr-FR')}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold wrap-anywhere text-ink">{team.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{team.memberCount} membre{team.memberCount === 1 ? '' : 's'}</span>
                    {active && <span className="inline-flex items-center gap-1 font-semibold text-brand"><NavIcon name="check" width="13" height="13" />Actuelle</span>}
                    {team.memberCount === 0 && <span>À compléter</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 max-sm:pl-14">
                <button type="button" disabled={disabled} onClick={() => void choose(team.id, true)} aria-label={`Gérer l’équipe ${team.name}`} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-white hover:text-brand disabled:cursor-not-allowed disabled:opacity-50">Gérer</button>
                <button type="button" disabled={disabled} onClick={() => void choose(team.id, false)} aria-label={`Ouvrir l’équipe ${team.name}`} className={`${active ? primaryButton : secondaryButton} group/open max-sm:flex-1`}>
                  {openingId === team.id ? 'Ouverture…' : 'Ouvrir'}<span aria-hidden="true" className="motion-safe:transition-transform motion-safe:group-hover/open:translate-x-1">→</span>
                </button>
              </div>
            </li>;
          })}
        </ul>}
        {results.length > pageSize && <nav aria-label="Pagination des équipes" className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
          <p className="text-xs text-muted">Page {currentPage + 1} sur {pageCount}</p>
          <div className="flex gap-2"><button type="button" className={secondaryButton} disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)} aria-label="Page précédente des équipes">←<span className="sr-only sm:not-sr-only">Précédente</span></button><button type="button" className={secondaryButton} disabled={currentPage === pageCount - 1} onClick={() => changePage(currentPage + 1)} aria-label="Page suivante des équipes"><span className="sr-only sm:not-sr-only">Suivante</span>→</button></div>
        </nav>}
        {ready && teams.length > 0 && <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">Ouvrir pour préparer le point · Gérer pour modifier les membres et les réglages.</p>}
      </section>

      <aside className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white" aria-labelledby="create-team-heading">
        <div className="relative overflow-hidden bg-brand-dark p-5 text-white">
          <span aria-hidden="true" className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full border border-white/10" />
          <span aria-hidden="true" className="pointer-events-none absolute -top-3 -right-3 size-26 rounded-full border border-white/10" />
          <span aria-hidden="true" className="mb-4 grid size-10 place-items-center rounded-xl border border-white/20 bg-white/10 text-orange-200"><NavIcon name="plus" /></span>
          <h2 id="create-team-heading" className="relative text-lg font-bold tracking-tight">Une nouvelle équipe ?</h2>
          <p className="relative mt-2 max-w-64 text-sm leading-relaxed text-blue-100">Rassemblez vos collègues dans un espace à vous.</p>
        </div>
        <form onSubmit={event => void create(event)} className="flex flex-col gap-2 p-5" noValidate aria-busy={pending && !openingId}>
          <label htmlFor="new-team-name" className="text-sm font-semibold text-ink">Nom de l’équipe</label>
          <input ref={nameInput} id="new-team-name" value={name} onChange={event => { setName(event.target.value); setCreateError(''); }} placeholder="Ex. Équipe Produit" aria-invalid={!!createError} aria-describedby={createError ? 'team-name-hint team-create-error' : 'team-name-hint'} required maxLength={60} className="min-h-11 min-w-0 w-full rounded-xl border border-line bg-slate-50 px-3 text-sm text-ink placeholder:text-muted focus:border-brand" />
          <p id="team-name-hint" className="text-xs text-muted">Un nom reconnaissable, 60 caractères maximum.</p>
          {createError && <p id="team-create-error" role="alert" className="mt-1 text-sm text-danger">{createError}</p>}
          <button type="submit" disabled={disabled} className={`${primaryButton} mt-3 w-full`}><NavIcon name="plus" />{pending && !openingId ? 'Création…' : 'Créer une équipe'}</button>
          <p className="mt-1 text-center text-xs text-muted">Vous ajouterez les membres juste après.</p>
        </form>
        <div className="mx-5 flex gap-2 border-t border-line py-4 text-xs leading-relaxed text-muted"><NavIcon name="people" className="mt-0.5 shrink-0 text-brand" /><p>Les équipes sont partagées sur ce site. Présences, humeurs et bilans restent propres à chacune.</p></div>
      </aside>
    </div>
  </div>;
}