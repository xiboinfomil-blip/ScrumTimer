'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info as NoticeIcon } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { cn } from 'cn';


import { useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { ArrowRight as ArrowForwardIcon } from 'lucide-react';
import { ChevronUp as KeyboardArrowUpIcon } from 'lucide-react';
import { ChevronDown as KeyboardArrowDownIcon } from 'lucide-react';
import { Star as StarOutlineIcon } from 'lucide-react';
import { Star as StarIcon } from 'lucide-react';
import { X as CloseIcon } from 'lucide-react';
import { LayoutGrid as GridViewOutlinedIcon } from 'lucide-react';
import { Network as AccountTreeOutlinedIcon } from 'lucide-react';
import { Settings as SettingsOutlinedIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTeam } from '@/providers/team-provider';
import { NavIcon } from '@/components/layout/nav-icon';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { filterTeams } from '@/lib/team/team-directory';
import { SprintPicker } from '@/components/jira/sprint-picker';
import { JiraDisplayPicker } from '@/components/jira/display-picker';
import { JiraAccount } from '@/components/jira/jira-account';
import { useJiraResource } from '@/hooks/jira/use-jira-resource';
import type { JiraConnection, JiraSprintSelection } from '@/lib/jira/jira';
import { field, primaryButton, secondaryButton } from '@/components/ui/styles';

const searchable = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');
const pageSize = 6;
type View = 'all' | 'favorites';

export function TeamsPage() {
  const { teams, activeTeamId, teamBusy, ready, cloudStatus, switchTeam, createTeam, setTeamFavorite } = useTeam();
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
    .filter(team => searchable(team.name).includes(searchable(query.trim())));
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

    return <div className="mx-auto flex min-h-0 w-full flex-1 flex-col overflow-y-auto pb-3" aria-labelledby="teams-heading">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b border-line pt-2 pb-4 sm:pb-4 lg:pt-4 lg:pb-4">
          <div className="min-w-0">
              <p className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase text-muted"><span aria-hidden="true" className="size-2 rounded-sm bg-accent" />Espace de travail</p>
            <h1 id="teams-heading" className="text-xl font-bold text-ink sm:text-2xl">Vos équipes<span className="text-accent">.</span></h1>
            <p className="mt-1.5 text-xs text-muted"><span className="font-semibold tabular-nums text-ink">{ready ? teams.length : '—'}</span> équipes <span aria-hidden="true" className="mx-2 text-line">/</span><span className="font-semibold tabular-nums text-ink">{ready ? totalMembers : '—'}</span> collaborateurs</p>
          </div>
            <Button type="button" onClick={revealCreate} disabled={disabled} aria-haspopup="dialog" className={`${primaryButton} min-h-11 max-sm:w-full`} variant="ghost"><NavIcon name="plus" width="18" height="18" />Ajouter une nouvelle équipe</Button>
        </header>
      {loginFailure && <Alert variant={"destructive"} className="mb-4"><NoticeIcon aria-hidden="true" /><AlertDescription>Connexion Jira refusée ou expirée. Réessayez la connexion.</AlertDescription></Alert>}
      <Dialog open={loginTeamId !== null} onOpenChange={next => { if (!next) (() => setLoginTeamId(null))?.(); }}><DialogContent showCloseButton={false} className="min-h-0 max-w-[400px]" aria-labelledby="jira-team-login-title">
        <DialogTitle id="jira-team-login-title" className="shrink-0 px-5 pt-5 pb-2">Connexion Jira requise</DialogTitle>
        <div className="min-h-0 overflow-y-auto px-5 py-3"><p className="mb-4 break-words text-sm text-ink">{teams.find(team => team.id === loginTeamId)?.name}</p><JiraAccount connection={connection.data} loading={connection.loading} error={connection.error} onRetry={connection.retry} /></div>
        <DialogFooter><Button type="button" onClick={() => setLoginTeamId(null)} className={secondaryButton} variant="ghost">Annuler</Button></DialogFooter>
      </DialogContent></Dialog>
    <div className="min-w-0">
      <section className="min-w-0 pt-4" aria-labelledby="team-list-heading">
        <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div role="group" aria-label="Afficher les équipes" className="grid min-h-11 min-w-0 grid-cols-2 gap-1 rounded-xl border border-line bg-slate-100/80 p-1 sm:w-auto sm:min-w-[260px]">
            {([['all', 'Toutes', GridViewOutlinedIcon, teams.length], ['favorites', 'Favoris', StarOutlineIcon, teams.filter(team => team.favorite).length]] as const).map(([value, label, Icon, count]) => <Button key={value} type="button" aria-pressed={view === value} onClick={() => { setView(value); setPage(0); }} className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand sm:gap-2 sm:px-3 sm:text-xs ${view === value ? 'bg-white text-brand shadow-sm' : 'text-muted hover:bg-white/70 hover:text-ink'}`} variant="ghost">
              <Icon aria-hidden="true" className="hidden shrink-0 sm:block" size={17} />
              <span className="min-w-0 truncate">{label}</span><span aria-hidden="true" className={`min-w-4 rounded px-1 text-center text-[10px] tabular-nums ${view === value ? 'bg-blue-50 text-brand' : 'text-muted'}`}>{ready ? count : '—'}</span>
            </Button>)}
          </div>
          <div className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-control bg-white px-3 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/10 sm:w-72">
            <NavIcon name="search" className="shrink-0 text-muted" width="16" height="16" />
            <label htmlFor="team-page-search" className="sr-only">Rechercher une équipe</label>
            <Input id="team-page-search" type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Rechercher par nom d’équipe…" className="min-h-11 min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted focus-visible:outline-none" />
          </div>
        </div>
        <div className="mb-2 flex min-w-0 items-baseline justify-between gap-3">
          <h2 ref={listHeading} tabIndex={-1} id="team-list-heading" className="min-w-0 text-sm font-semibold text-ink">{view === 'favorites' ? 'Équipes favorites' : 'Choisir une équipe'}</h2>
          <p role="status" aria-live="polite" aria-atomic="true" className="shrink-0 text-[11px] text-muted">{!ready ? 'Chargement…' : `${results.length} résultat${results.length === 1 ? '' : 's'}`}</p>
        </div>
        {error && <Alert variant={"destructive"} className="mb-3"><NoticeIcon aria-hidden="true" /><AlertDescription>{error}</AlertDescription></Alert>}
        <p role="status" className="sr-only">{pending ? openingId ? 'Ouverture de l’équipe…' : 'Création de l’équipe…' : ''}</p>
        <div className="flex min-w-0 gap-2 overflow-hidden">
          <div className="min-w-0 flex-1">
            {!ready && cloudStatus !== 'error' ? <PageSkeleton variant="teams" scope="section" /> : !teams.length ? <div className="rounded-xl border border-line bg-white px-5 py-7 text-center">
              <NavIcon name="people" className="mx-auto mb-3 text-brand" /><p role="status" className="text-sm font-semibold text-ink">{cloudStatus === 'error' ? 'Équipes indisponibles. Réessayez la connexion Neon.' : 'Votre première équipe commence ici.'}</p>
              {cloudStatus !== 'error' && <Button type="button" onClick={revealCreate} className={`${secondaryButton} mt-4`} variant="ghost">Nommer mon équipe <NavIcon name="plus" /></Button>}
            </div> : !results.length ? <div className="rounded-xl border border-line bg-white px-5 py-7 text-center">
              <StarOutlineIcon aria-hidden="true" className="mb-2 text-muted" /><p className="text-sm font-semibold text-ink">{view === 'favorites' ? 'Aucune équipe favorite dans cette sélection.' : 'Aucune équipe trouvée.'}</p>
              <p className="mt-2 text-xs text-muted">{view === 'favorites' ? 'Touchez l’étoile d’une équipe pour la retrouver ici.' : 'Essayez un autre nom.'}</p>
              <Button type="button" onClick={() => { setQuery(''); setView('all'); setPage(0); }} className={`${secondaryButton} mt-4`} variant="ghost">Afficher toutes les équipes</Button>
            </div> : <motion.ul key={currentPage} initial={reducedMotion || !direction ? false : { y: direction * 12, opacity: .35 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: reducedMotion ? 0 : .24 }} aria-label="Équipes disponibles" aria-busy={teamBusy || pending} className="grid list-none gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {visibleTeams.map((team, index) => {
                const active = activeTeamId === team.id;
                return <motion.li key={team.id} initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .28, delay: reducedMotion ? 0 : index * .035 }} className={`group flex min-w-0 flex-col overflow-hidden rounded-lg border bg-white motion-safe:transition-shadow hover:shadow-[0_6px_20px_#202b3608] ${active ? 'border-brand/50' : 'border-line hover:border-brand/40'}`}>
                  <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
                    <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-lg text-xs font-bold ${active ? 'bg-brand text-white' : team.kind === 'sprint' ? 'bg-orange-50 text-amber-800' : 'bg-slate-100 text-muted'}`}>{team.name.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase('fr-FR')}</span>
                    {active && <span className="mr-auto inline-flex min-h-7 items-center gap-1.5 rounded-full bg-blue-50 px-2.5 text-[10px] font-semibold text-brand"><span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />Actuelle</span>}
                    <Button type="button" disabled={disabled || team.jiraLocked} aria-label={`${team.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} : ${team.name}`} title={team.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} aria-pressed={team.favorite} onClick={() => setTeamFavorite(team.id, !team.favorite)} className={`grid size-11 shrink-0 place-items-center rounded-lg transition-colors hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:cursor-not-allowed disabled:text-muted ${team.favorite ? 'text-amber-800' : 'text-muted'}`} variant="ghost">{team.favorite ? <StarIcon aria-hidden="true" size={21} /> : <StarOutlineIcon aria-hidden="true" size={21} />}</Button>
                  </div>
                  <div className="min-w-0 flex-1 px-3 pt-2 pb-3"><h3 className="text-sm leading-5 font-semibold wrap-anywhere text-ink">{team.name}</h3><p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted"><NavIcon name="people" width="15" height="15" />{team.jiraLocked ? 'Connexion Jira requise' : <>{team.memberCount} membre{team.memberCount === 1 ? '' : 's'}{team.memberCount === 0 && ' · À compléter'}</>}</p>{team.kind === 'sprint' && <p className="mt-1.5 flex items-start gap-1.5 text-[11px] wrap-anywhere text-brand"><AccountTreeOutlinedIcon aria-hidden="true" size={15} />Sprint Jira · {team.sprintName ?? ''}</p>}</div>
                  <div className={`flex flex-wrap items-center justify-between gap-2 border-t px-2 py-1.5 ${active ? 'border-brand/10 bg-blue-50/40' : 'border-slate-100'}`}>
                    <Button type="button" disabled={disabled} onClick={() => void choose(team.id, true)} aria-label={`Gérer l’équipe ${team.name}`} title="Gérer l’équipe" className={`${secondaryButton} px-3 text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand`} variant="ghost"><SettingsOutlinedIcon aria-hidden="true" size={17} /><span>Gérer</span></Button><Button type="button" disabled={disabled} onClick={() => void choose(team.id, false)} aria-label={`Ouvrir l’équipe ${team.name}`} className={`${active ? primaryButton : secondaryButton} px-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand`} variant="ghost">{openingId === team.id ? 'Ouverture…' : 'Ouvrir'}<ArrowForwardIcon aria-hidden="true" size={16} /></Button>
                  </div>
                </motion.li>;
              })}
            </motion.ul>}
          </div>
          {results.length > pageSize && <nav aria-label="Pagination des équipes" className="flex w-11 shrink-0 flex-col items-center justify-center gap-2">
            <Button type="button" className={`${secondaryButton} size-11 px-0`} disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)} aria-label="Page précédente des équipes" variant="ghost"><KeyboardArrowUpIcon aria-hidden="true" /></Button>
            <p role="status" className="text-center text-xs tabular-nums text-muted">{currentPage + 1}<span className="block text-[10px]">sur {pageCount}</span></p>
            <Button type="button" className={`${secondaryButton} size-11 px-0`} disabled={currentPage === pageCount - 1} onClick={() => changePage(currentPage + 1)} aria-label="Page suivante des équipes" variant="ghost"><KeyboardArrowDownIcon aria-hidden="true" /></Button>
          </nav>}
        </div>
      </section>

      <Dialog open={showCreate} onOpenChange={next => { if (!next) (() => { if (!pending) setShowCreate(false); })?.(); }}><DialogContent showCloseButton={false} className="min-h-0 max-h-[calc(100dvh-24px)] w-[calc(100%-24px)] rounded-lg sm:max-h-[calc(100dvh-64px)] max-w-[600px]" aria-labelledby="create-team-heading" aria-describedby="create-team-description" onOpenAutoFocus={event => { event.preventDefault(); (() => nameInput.current?.focus())(); }}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-t-4 border-brand bg-slate-50/70 px-5 pt-4 pb-5 sm:px-7 sm:pt-6"><div className="min-w-0"><span aria-hidden="true" className="mb-3 grid size-11 place-items-center rounded-lg bg-blue-50 text-brand"><NavIcon name="people" width="24" height="24" /></span><DialogTitle id="create-team-heading" className={cn("shrink-0 px-5 pt-5 pb-2", "p-0 text-xl leading-7 font-bold text-ink")}>Ajouter une nouvelle équipe</DialogTitle><DialogDescription id="create-team-description" className="mt-1 text-xs leading-5 text-muted">Un espace partagé pour votre point quotidien.</DialogDescription></div><Button type="button" disabled={pending} onClick={() => setShowCreate(false)} aria-label="Fermer" title="Fermer" className="grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-50" variant="ghost"><CloseIcon aria-hidden="true" size={20} /></Button></div>
        <div className={cn("min-h-0 overflow-y-auto px-5 py-3", "border-t border-line px-5 py-5 sm:px-7 sm:py-6")}>
          <form id="create-team-form" onSubmit={event => void create(event)} className="flex flex-col gap-3" noValidate aria-busy={pending && !openingId}>
            <div className="flex items-center justify-between gap-2"><label htmlFor="new-team-name" className="text-xs font-semibold text-ink">Nom de l’équipe</label><p id="team-name-hint" className="text-[11px] tabular-nums text-muted">{name.length} / 60 caractères</p></div>
            <Input ref={nameInput} autoFocus id="new-team-name" value={name} onChange={event => { setName(event.target.value); setCreateError(''); }} placeholder="Ex. Squad Produit" aria-invalid={!!createError} aria-describedby={createError ? 'team-name-hint team-create-error' : 'team-name-hint'} required maxLength={60} disabled={pending} className={`${field} min-h-12 w-full bg-white`} />
            <fieldset className="mt-3 min-w-0 border-0 p-0"><legend className="mb-2 text-xs font-semibold text-ink">Type d’équipe</legend><div className="grid grid-cols-2 gap-2" role="group" aria-label="Type d’équipe">{(['ordinary', 'sprint'] as const).map(value => <Button key={value} type="button" disabled={pending} aria-label={value === 'ordinary' ? 'Ordinaire' : 'Sprint Jira'} aria-pressed={kind === value} onClick={() => { setKind(value); setCreateError(''); }} className={`grid min-h-[76px] min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-2 items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:px-3 ${kind === value ? 'border-brand bg-blue-50/70 text-brand ring-1 ring-brand' : 'border-line bg-white text-ink hover:border-brand/40 hover:bg-slate-50'}`} variant="ghost">
              <span aria-hidden="true" className={`row-span-2 grid size-9 shrink-0 place-items-center rounded-lg ${kind === value ? 'bg-white text-brand' : 'bg-slate-100 text-muted'}`}>{value === 'ordinary' ? <NavIcon name="people" width="20" height="20" /> : <AccountTreeOutlinedIcon size={20} />}</span><span className="min-w-0 self-end text-xs font-semibold">{value === 'ordinary' ? 'Ordinaire' : 'Sprint Jira'}</span><span aria-hidden="true" className={`col-start-3 row-start-1 grid size-4 shrink-0 place-items-center rounded-full border ${kind === value ? 'border-brand bg-brand text-white' : 'border-slate-300'}`}>{kind === value && <NavIcon name="check" width="12" height="12" />}</span><span className="col-span-2 col-start-2 row-start-2 min-w-0 self-start text-[10px] leading-4 text-muted">{value === 'ordinary' ? 'Équipe classique' : 'Sprint Jira actif'}</span>
            </Button>)}</div></fieldset>
          </form>
          {kind === 'sprint' && <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4"><JiraAccount connection={connection.data} loading={connection.loading} error={connection.error} onRetry={connection.retry} /><SprintPicker value={sprint} onChange={setSprint} disabled={pending} connected={!!connection.data?.connected} /><JiraDisplayPicker cloudId={connection.data?.connected ? sprint.cloudId : ''} boardId={sprint.boardId} value={sprint.display} onChange={display => setSprint(value => ({ ...value, display }))} disabled={pending || !sprint.boardId} /></div>}
          {createError && <p id="team-create-error" role="alert" className="mt-3 text-sm text-danger">{createError}</p>}
        </div>
        <DialogFooter className="flex-col-reverse gap-2 border-t border-line bg-slate-50/70 px-5 py-4 sm:flex-row sm:px-7">
          <Button type="button" disabled={pending} onClick={() => setShowCreate(false)} className={`${secondaryButton} w-full sm:w-auto`} variant="ghost">Annuler</Button>
          <Button type="submit" form="create-team-form" disabled={disabled || (kind === 'sprint' && (!connection.data?.connected || !sprint.sprintId))} className={`${primaryButton} w-full sm:w-auto`} variant="ghost"><NavIcon name="plus" width="17" height="17" />{pending && !openingId ? 'Création…' : 'Créer l’équipe'}</Button>
        </DialogFooter>
      </DialogContent></Dialog>
    </div>
  </div>;
}