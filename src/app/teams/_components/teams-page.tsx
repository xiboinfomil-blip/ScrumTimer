'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import StarIcon from '@mui/icons-material/Star';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { motion, useReducedMotion } from 'framer-motion';
import { useTeam } from '@/providers/team-provider';
import { NavIcon } from '@/components/layout/nav-icon';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { filterTeams } from '@/lib/team/team-directory';
import { SprintPicker } from '@/components/jira/sprint-picker';
import { JiraAccount } from '@/components/jira/jira-account';
import { useJiraResource } from '@/hooks/jira/use-jira-resource';
import type { JiraConnection, JiraSprintSelection } from '@/lib/jira/jira';

const searchable = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');
const pageSize = 6;
const secondaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 text-xs font-semibold text-brand hover:border-brand/40 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50';
const field = 'min-h-11 min-w-0 rounded-lg border border-line bg-slate-50/80 px-3 text-sm text-ink placeholder:text-muted focus:border-brand';
type View = 'all' | 'current' | 'favorites';

export function TeamsPage() {
  const { teams, activeTeamId, teamBusy, ready, cloudStatus, switchTeam, createTeam, updateTeamDirectory } = useTeam();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('all');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'ordinary' | 'sprint'>('ordinary');
  const [sprint, setSprint] = useState<JiraSprintSelection>({ cloudId: '', boardId: 0, sprintId: 0 });
  const connection = useJiraResource<JiraConnection>('/api/jira');
  const loginFailure = useSearchParams().get('jira') === 'error';
  const [showCreate, setShowCreate] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(0);
  const reducedMotion = useReducedMotion();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [loginTeamId, setLoginTeamId] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const results = filterTeams(teams, { favoritesOnly: view === 'favorites' })
    .filter(team => (view !== 'current' || team.id === activeTeamId) && searchable(team.name).includes(searchable(query.trim())));
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleTeams = results.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const totalMembers = teams.reduce((total, team) => total + team.memberCount, 0);
  const disabled = teamBusy || pending || !ready;

  function changePage(next: number) {
    setDirection(next > currentPage ? 1 : -1); setPage(next); listHeading.current?.focus();
  }
  function revealCreate() {
    setCreateError('');
    setShowCreate(true);
  }
  async function choose(id: string, manage: boolean) {
    if (disabled) return;
    const team = teams.find(team => team.id === id);
    if (team?.kind === 'sprint' && (team.jiraLocked || !connection.data?.connected)) { setLoginTeamId(id); return; }
    setPending(true); setOpeningId(id); setError('');
    const success = await switchTeam(id);
    setPending(false); setOpeningId(null);
    if (success) router.push(`${manage ? '/manage-team' : '/participants'}?team=${id}`);
    else if (team?.kind === 'sprint') { connection.retry(); setLoginTeamId(id); }
    else setError('Changement impossible. Vérifiez la connexion et les sauvegardes en attente.');
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    if (!name.trim() || name.trim().length > 60 || /\p{Cc}/u.test(name)) {
      setCreateError('Choisissez un nom de 1 à 60 caractères, sans caractère de contrôle.'); nameInput.current?.focus(); return;
    }
    setPending(true); setCreateError('');
    if (kind === 'sprint' && (!connection.data?.connected || !sprint.sprintId)) { setPending(false); setCreateError('Connectez-vous à Jira et choisissez un sprint actif.'); return; }
    const success = await createTeam(name.trim(), null, kind === 'sprint' ? sprint : undefined);
    setPending(false);
    if (success) router.push(`/manage-team${window.location.search}`);
    else setCreateError('Création impossible. Ce nom existe peut-être déjà ; vérifiez aussi la connexion.');
  }

  return <div className="mx-auto flex min-h-0 w-full flex-1 flex-col overflow-y-auto pb-4" aria-labelledby="teams-heading">
        <header className="mb-5 flex shrink-0 items-center justify-between gap-3 pt-2 pb-5 sm:mb-6 sm:border-b sm:border-line lg:pt-4 lg:pb-7">
          <div>
            <div className="flex flex-wrap items-center gap-2"><h1 id="teams-heading" className="text-xl font-bold text-ink sm:text-2xl">Vos équipes</h1><span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-muted sm:hidden">{ready ? teams.length : '—'} équipes</span></div>
            <p className="mt-1 text-xs text-muted">{ready ? totalMembers : '—'} collaborateurs</p>
          </div>
          <dl className="ml-auto hidden shrink-0 items-center gap-7 text-right sm:flex" aria-label="Résumé des équipes"><div><dt className="text-[10px] text-muted uppercase">Équipes</dt><dd className="mt-1 text-xl font-bold tabular-nums text-ink">{ready ? teams.length : '—'}</dd></div><div className="border-l border-line pl-7"><dt className="text-[10px] text-muted uppercase">Membres</dt><dd className="mt-1 text-xl font-bold tabular-nums text-ink">{ready ? totalMembers : '—'}</dd></div></dl>
        </header>
      {loginFailure && <Alert severity="error" className="mb-4">Connexion Jira refusée ou expirée. Réessayez la connexion.</Alert>}
      <Dialog open={loginTeamId !== null} onClose={() => setLoginTeamId(null)} fullWidth maxWidth="xs" aria-labelledby="jira-team-login-title">
        <DialogTitle id="jira-team-login-title">Connexion Jira requise</DialogTitle>
        <DialogContent><p className="mb-4 break-words text-sm text-ink">{teams.find(team => team.id === loginTeamId)?.name}</p><JiraAccount connection={connection.data} loading={connection.loading} error={connection.error} onRetry={connection.retry} /></DialogContent>
        <DialogActions><button type="button" onClick={() => setLoginTeamId(null)} className={secondaryButton}>Annuler</button></DialogActions>
      </Dialog>
    <div className="min-w-0">
      <section className="min-w-0" aria-labelledby="team-list-heading">
        <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:border-b sm:border-slate-100 sm:pb-3"><h2 ref={listHeading} tabIndex={-1} id="team-list-heading" className="text-[10px] font-medium tracking-wide text-muted uppercase sm:text-xs sm:font-semibold sm:tracking-normal sm:text-ink sm:normal-case"><span className="sm:hidden">Équipes</span><span className="hidden sm:inline">Choisir une équipe</span></h2><span role="status" aria-live="polite" aria-atomic="true" className="text-[10px] text-muted">{!ready ? 'Chargement…' : `${results.length} résultat${results.length === 1 ? '' : 's'}`}</span><button type="button" onClick={revealCreate} disabled={disabled} aria-haspopup="dialog" className={`${primaryButton} max-sm:w-full`}><NavIcon name="plus" width="16" height="16" />Ajouter une nouvelle équipe</button></div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex min-h-11 min-w-0 basis-full items-center gap-2 rounded-lg border border-line bg-slate-50/70 px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/10">
            <NavIcon name="search" className="shrink-0 text-muted" width="16" height="16" />
            <label htmlFor="team-page-search" className="sr-only">Rechercher une équipe</label>
            <input id="team-page-search" type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Rechercher par nom d’équipe…" className="min-h-11 min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted focus-visible:outline-none" />
          </div>
          <div role="group" aria-label="Afficher les équipes" className="flex shrink-0 gap-1 max-sm:w-full">
            {([['all', 'Toutes'], ['current', 'Mon équipe'], ['favorites', 'Favorites']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={view === value} onClick={() => { setView(value); setPage(0); }} className={`min-h-11 rounded-lg px-3 text-xs font-medium max-sm:flex-1 ${view === value ? 'bg-ink text-white' : 'text-muted hover:bg-white hover:text-ink'}`}>{label}</button>)}
          </div>
        </div>
        {error && <Alert severity="error" className="mb-3">{error}</Alert>}
        <p role="status" className="sr-only">{pending ? openingId ? 'Ouverture de l’équipe…' : 'Création de l’équipe…' : ''}</p>
        <div className="flex min-w-0 gap-2 overflow-hidden">
          <div className="min-w-0 flex-1">
            {!ready && cloudStatus !== 'error' ? <PageSkeleton variant="teams" scope="section" /> : !teams.length ? <div className="rounded-xl border border-line bg-white px-5 py-10 text-center">
              <NavIcon name="people" className="mx-auto mb-3 text-brand" /><p role="status" className="text-sm font-semibold text-ink">{cloudStatus === 'error' ? 'Équipes indisponibles. Réessayez la connexion Neon.' : 'Votre première équipe commence ici.'}</p>
              {cloudStatus !== 'error' && <button type="button" onClick={revealCreate} className={`${secondaryButton} mt-4`}>Nommer mon équipe <NavIcon name="plus" /></button>}
            </div> : !results.length ? <div className="rounded-xl border border-line bg-white px-5 py-10 text-center">
              <StarOutlineIcon aria-hidden="true" className="mb-2 text-muted" /><p className="text-sm font-semibold text-ink">{view === 'favorites' ? 'Aucune équipe favorite dans cette sélection.' : 'Aucune équipe trouvée.'}</p>
              <p className="mt-2 text-xs text-muted">{view === 'favorites' ? 'Touchez l’étoile d’une équipe pour la retrouver ici.' : 'Essayez un autre nom.'}</p>
              <button type="button" onClick={() => { setQuery(''); setView('all'); setPage(0); }} className={`${secondaryButton} mt-4`}>Afficher toutes les équipes</button>
            </div> : <motion.ul key={currentPage} initial={reducedMotion || !direction ? false : { y: direction * 20, opacity: .35 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: reducedMotion ? 0 : .3 }} aria-label="Équipes disponibles" aria-busy={teamBusy || pending} className="grid list-none gap-3">
              {visibleTeams.map(team => {
                const active = activeTeamId === team.id;
                return <li key={team.id} className={`group min-w-0 rounded-lg border bg-white p-3 transition-colors hover:border-brand/40 xl:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:gap-x-2 xl:px-4 xl:py-3 ${active ? 'border-brand/40 ring-1 ring-brand/5' : 'border-line'}`}>
                  <div className="flex min-w-0 items-center gap-2.5 xl:row-span-2">
                    <span aria-hidden="true" className={`grid size-11 shrink-0 place-items-center rounded-lg border text-sm font-semibold ${active ? 'border-brand bg-brand text-white max-sm:border-blue-200 max-sm:bg-blue-50 max-sm:text-brand' : 'border-slate-100 bg-slate-50 text-slate-500'}`}>{team.name.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase('fr-FR')}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h3 className="text-sm font-semibold wrap-anywhere text-ink">{team.name}</h3>{active && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Actuelle</span>}</div>
                      <p className="mt-1 text-[11px] text-muted">{team.jiraLocked ? 'Connexion Jira requise' : <>{team.memberCount} membre{team.memberCount === 1 ? '' : 's'}{team.memberCount === 0 && ' · À compléter'}</>}</p>
                      {team.kind === 'sprint' && <p className="mt-1 break-words text-[11px] text-brand">Sprint Jira · {team.sprintName ?? ''}</p>}
                    </div>
                    <button type="button" disabled={disabled || team.jiraLocked} aria-label={`${team.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} : ${team.name}`} aria-pressed={team.favorite} onClick={() => void updateTeamDirectory({ teamId: team.id, favorite: !team.favorite })} className={`grid size-11 shrink-0 place-items-center rounded-lg hover:bg-amber-50 disabled:opacity-50 ${team.favorite ? 'text-amber-500' : 'text-slate-400'}`}>{team.favorite ? <StarIcon aria-hidden="true" sx={{ fontSize: 21 }} /> : <StarOutlineIcon aria-hidden="true" sx={{ fontSize: 21 }} />}</button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-1 border-t border-slate-100 pt-2 xl:col-start-2 xl:row-start-1 xl:row-span-2 xl:mt-0 xl:border-0 xl:pt-0">
                    <div className="flex items-center gap-1"><button type="button" disabled={disabled} onClick={() => void choose(team.id, true)} aria-label={`Gérer l’équipe ${team.name}`} className="min-h-11 min-w-11 rounded-lg px-2 text-xs text-muted hover:bg-slate-50 disabled:opacity-50">Gérer</button><button type="button" disabled={disabled} onClick={() => void choose(team.id, false)} aria-label={`Ouvrir l’équipe ${team.name}`} className={`${active ? primaryButton : secondaryButton} px-3`}>{openingId === team.id ? 'Ouverture…' : 'Ouvrir'}<ArrowForwardIcon aria-hidden="true" sx={{ fontSize: 14 }} /></button></div>
                  </div>
                </li>;
              })}
            </motion.ul>}
          </div>
          {results.length > pageSize && <nav aria-label="Pagination des équipes" className="flex w-11 shrink-0 flex-col items-center justify-center gap-2">
            <button type="button" className={`${secondaryButton} size-11 px-0`} disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)} aria-label="Page précédente des équipes"><KeyboardArrowUpIcon aria-hidden="true" /></button>
            <p role="status" className="text-center text-xs tabular-nums text-muted">{currentPage + 1}<span className="block text-[10px]">sur {pageCount}</span></p>
            <button type="button" className={`${secondaryButton} size-11 px-0`} disabled={currentPage === pageCount - 1} onClick={() => changePage(currentPage + 1)} aria-label="Page suivante des équipes"><KeyboardArrowDownIcon aria-hidden="true" /></button>
          </nav>}
        </div>
        </div>
        <div className="mt-7 text-center text-[10px] leading-5 text-muted sm:hidden"><p><AutoAwesomeIcon aria-hidden="true" className="mr-1 text-accent" sx={{ fontSize: 12 }} />Moins de réunions. Plus de sens.</p><p className="text-[9px]">Infomil Mauritius · Persistance Neon DB</p></div>
      </section>

      <Dialog open={showCreate} onClose={() => { if (!pending) setShowCreate(false); }} fullWidth maxWidth="sm" aria-labelledby="create-team-heading" slotProps={{ transition: { onEntered: () => nameInput.current?.focus() } }}>
        <DialogTitle id="create-team-heading">Ajouter une nouvelle équipe</DialogTitle>
        <DialogContent dividers>
          <fieldset className="my-2"><legend className="mb-1 text-xs font-medium text-ink">Type d’équipe</legend><div className="flex gap-1" role="group" aria-label="Type d’équipe">{(['ordinary', 'sprint'] as const).map(value => <button key={value} type="button" disabled={pending} aria-pressed={kind === value} onClick={() => { setKind(value); setCreateError(''); }} className={`min-h-11 min-w-0 flex-1 rounded-lg px-2 text-xs ${kind === value ? 'bg-brand text-white' : 'bg-slate-100 text-muted'}`}>{value === 'ordinary' ? 'Ordinaire' : 'Sprint Jira'}</button>)}</div></fieldset>
          {kind === 'sprint' && <JiraAccount connection={connection.data} loading={connection.loading} error={connection.error} onRetry={connection.retry} />}
          <form id="create-team-form" onSubmit={event => void create(event)} className="flex flex-col gap-2" noValidate aria-busy={pending && !openingId}>
            <label htmlFor="new-team-name" className="text-xs font-medium text-ink">Nom de l’équipe</label>
            <input ref={nameInput} autoFocus id="new-team-name" value={name} onChange={event => { setName(event.target.value); setCreateError(''); }} placeholder="Ex. Squad Produit, Agilité…" aria-invalid={!!createError} aria-describedby={createError ? 'team-name-hint team-create-error' : 'team-name-hint'} required maxLength={60} className={`${field} w-full`} />
            <p id="team-name-hint" className="flex flex-wrap justify-between gap-1 text-[10px] text-muted"><span>Un nom reconnaissable.</span><span>60 caractères max.</span></p>
            {kind === 'sprint' && <SprintPicker value={sprint} onChange={setSprint} disabled={pending} connected={!!connection.data?.connected} />}
            {createError && <p id="team-create-error" role="alert" className="text-sm text-danger">{createError}</p>}
          </form>
        </DialogContent>
        <DialogActions className="flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => setShowCreate(false)} className={secondaryButton}>Annuler</button>
          <button type="submit" form="create-team-form" disabled={disabled || (kind === 'sprint' && (!connection.data?.connected || !sprint.sprintId))} className={primaryButton}><NavIcon name="plus" width="17" height="17" />{pending && !openingId ? 'Création…' : 'Créer l’équipe'}</button>
        </DialogActions>
      </Dialog>
    </div>
  </div>;
}