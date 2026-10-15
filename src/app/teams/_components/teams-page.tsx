'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, InputBase, Paper } from '@mui/material';
import { useTeam } from '@/providers/team-provider';
import { NavIcon } from '@/components/layout/nav-icon';

const inputStyle = { minHeight: 48, width: '100%', minWidth: 0, fontSize: 14, px: 1.5 };
const searchable = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');

export function TeamsPage() {
  const { teams, activeTeamId, teamBusy, ready, cloudStatus, switchTeam, createTeam } = useTeam();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const results = teams.filter(team => searchable(team.name).includes(searchable(query.trim())));
  const disabled = teamBusy || pending || !ready;
  async function choose(id: string, manage: boolean) {
    if (disabled) return;
    setPending(true); setError('');
    const success = await switchTeam(id);
    setPending(false);
    if (success) router.push(`${manage ? '/manage-team' : '/participants'}?team=${id}`);
    else setError('Changement impossible. Vérifiez la connexion et les sauvegardes en attente.');
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    if (!name.trim() || name.trim().length > 60 || /\p{Cc}/u.test(name)) {
      setError('Choisissez un nom de 1 à 60 caractères, sans caractère de contrôle.'); return;
    }
    setPending(true); setError('');
    const success = await createTeam(name.trim());
    setPending(false);
    if (success) router.push(`/manage-team${window.location.search}`);
    else setError('Création impossible. Ce nom existe peut-être déjà ; vérifiez aussi la connexion.');
  }
  return <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-4 overflow-y-auto pb-2" aria-labelledby="teams-heading">
    <header className="relative shrink-0 overflow-hidden rounded-2xl border border-line bg-white p-6 max-[650px]:p-4">
      <span className="absolute inset-y-5 left-0 w-1 rounded-r bg-accent" aria-hidden="true" />
      <p className="mb-2 text-[10px] font-bold tracking-[.18em] text-brand uppercase">Votre espace quotidien</p>
      <h1 id="teams-heading" className="text-3xl font-bold tracking-tight text-ink max-[650px]:text-2xl">Tout commence par votre équipe.</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted max-[650px]:text-xs">Retrouvez votre équipe, confirmez les présences et prenez un moment pour chacun.</p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted max-[650px]:hidden"><span className="inline-flex items-center gap-2"><NavIcon name="people" />{teams.length} équipe{teams.length === 1 ? '' : 's'}</span><span className="inline-flex items-center gap-2"><NavIcon name="check" />Un espace distinct pour chaque équipe</span></div>
    </header>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0" aria-labelledby="team-list-heading">
        <div className="mb-3 flex items-center justify-between gap-2"><h2 id="team-list-heading" className="text-sm font-semibold text-ink">Choisir une équipe</h2><span role="status" className="text-xs text-muted">{results.length} résultat{results.length === 1 ? '' : 's'}</span></div>
        <label htmlFor="team-page-search" className="sr-only">Rechercher une équipe</label>
        <InputBase id="team-page-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher par nom…" startAdornment={<NavIcon name="search" className="mr-2 shrink-0 text-muted" />} sx={inputStyle} className="mb-3 rounded-xl border border-line bg-white focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/10" />
        {error && <Alert severity="error" className="mb-3">{error}</Alert>}
        {!teams.length ? <p role="status" className="rounded-2xl border border-dashed border-line bg-white p-6 text-sm text-muted">{cloudStatus === 'error' ? 'Équipes indisponibles. Réessayez la connexion Neon.' : 'Chargement des équipes…'}</p> : !results.length ? <div className="rounded-2xl border border-dashed border-line bg-white p-6 text-center"><p className="text-sm font-semibold text-ink">Aucune équipe trouvée.</p><p className="mt-1 text-xs text-muted">Essayez un autre nom ou créez votre équipe.</p><Button onClick={() => setQuery('')} sx={{ minHeight: 44, textTransform: 'none' }}>Effacer la recherche</Button></div> : <ul aria-label="Équipes disponibles" className="grid list-none gap-3 sm:grid-cols-2">
          {results.map(team => <Paper component="li" elevation={0} key={team.id} className={`flex min-w-0 flex-col gap-4 rounded-2xl border bg-white p-4 ${activeTeamId === team.id ? 'border-brand/30' : 'border-line'}`}>
            <div className="flex min-w-0 items-start gap-3"><span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-base font-bold text-brand">{Array.from(team.name)[0]?.toLocaleUpperCase('fr-FR')}</span><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold text-ink" title={team.name}>{team.name}</h3><p className="mt-1 text-xs text-muted">{team.memberCount} membre{team.memberCount === 1 ? '' : 's'}</p></div>{activeTeamId === team.id && <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-brand">Actuelle</span>}</div>
            <div className="mt-auto grid grid-cols-[1fr_auto] gap-2"><Button variant="contained" disableElevation disabled={disabled} onClick={() => void choose(team.id, false)} aria-label={`Ouvrir l’équipe ${team.name}`} sx={{ minHeight: 44, fontSize: 12, textTransform: 'none', borderRadius: '12px' }}>Ouvrir l’équipe <span aria-hidden="true" className="ml-2">→</span></Button><Button variant="outlined" disabled={disabled} onClick={() => void choose(team.id, true)} aria-label={`Gérer l’équipe ${team.name}`} sx={{ minHeight: 44, minWidth: 44, fontSize: 12, textTransform: 'none', borderRadius: '12px' }}>Gérer</Button></div>
          </Paper>)}
        </ul>}
      </section>
      <Paper component="aside" elevation={0} className="rounded-2xl border border-line bg-white p-5" aria-labelledby="create-team-heading"><span className="mb-3 grid size-10 place-items-center rounded-xl bg-orange-50 text-accent" aria-hidden="true"><NavIcon name="plus" /></span><h2 id="create-team-heading" className="text-base font-bold text-ink">Une nouvelle équipe ?</h2><p className="mt-2 text-xs leading-relaxed text-muted">Créez son espace, ajoutez ses membres, puis lancez votre premier point.</p><form onSubmit={event => void create(event)} className="mt-4 flex flex-col gap-2" noValidate><label htmlFor="new-team-name" className="text-xs font-semibold text-ink">Nom de l’équipe</label><InputBase id="new-team-name" value={name} onChange={event => setName(event.target.value)} placeholder="Ex. Équipe Produit" sx={inputStyle} className="rounded-xl border border-line bg-slate-50 focus-within:ring-2 focus-within:ring-brand/20" /><Button type="submit" variant="outlined" disabled={disabled} sx={{ minHeight: 44, mt: 1, fontSize: 12, textTransform: 'none', borderRadius: '12px' }}>Créer une équipe</Button></form><p className="mt-4 border-t border-line pt-3 text-[10px] leading-relaxed text-muted">Les équipes sont partagées sur ce site. Les présences, humeurs et bilans restent propres à chacune.</p></Paper>
    </div>
  </div>;
}