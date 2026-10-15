'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { Alert, Button, Chip, InputBase, Paper } from '@mui/material';
import { useTeam } from '@/providers/team-provider';
import { NavIcon } from './nav-icon';

const searchable = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';
const MotionPaper = motion.create(Paper);
const inputSx = { minHeight: 44, width: '100%', border: 1, borderColor: 'divider', borderRadius: '12px', px: 1.5, fontSize: 12, '&.Mui-focused': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } };

export function TeamSwitcher() {
  const { teams, activeTeamId, activeTeamName, teamBusy, ready, switchTeam, createTeam } = useTeam();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const submitting = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const activeTeam = teams.find(team => team.id === activeTeamId);
  const results = teams.filter(team => searchable(team.name).includes(searchable(query.trim())));
  const disabled = teamBusy || pending || !ready;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const close = () => { setOpen(false); trigger.current?.focus(); };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        // Return focus after the pointer's default focus action has completed.
        event.preventDefault();
        close();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  const select = async (id: string) => {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError('');
    const success = await switchTeam(id);
    submitting.current = false;
    if (!mounted.current) return;
    setPending(false);
    if (!success) { setError('Changement impossible. Vérifiez les sauvegardes et la connexion Neon.'); return; }
    setOpen(false);
    trigger.current?.focus();
    router.replace(`/participants${window.location.search}`);
  };

  const create = async () => {
    if (submitting.current) return;
    const clean = name.trim();
    if (!clean || clean.length > 60 || /\p{Cc}/u.test(name)) {
      setError('Le nom doit contenir de 1 à 60 caractères, sans caractère de contrôle.');
      return;
    }
    submitting.current = true;
    setPending(true);
    setError('');
    const success = await createTeam(clean);
    submitting.current = false;
    if (!mounted.current) return;
    setPending(false);
    if (!success) { setError('Création impossible. Vérifiez les sauvegardes et la connexion Neon, puis réessayez.'); return; }
    setName('');
    setCreating(false);
    setOpen(false);
    trigger.current?.focus();
    router.replace(`/participants${window.location.search}`);
  };

  return <div ref={root} className="relative min-w-0 max-w-52 flex-1 min-[801px]:max-w-40 min-[1101px]:max-w-52">
    <Button ref={trigger} type="button" variant="outlined" className={`${focus} rounded-xl border-slate-200 bg-slate-50/70 text-ink hover:border-brand/30 hover:bg-blue-50/60`} sx={{ minHeight: 44, width: '100%', minWidth: 0, gap: .75, px: 1, fontSize: 12, textTransform: 'none' }} aria-expanded={open} aria-controls={panelId} aria-label={`Choisir une équipe : ${activeTeamName || 'chargement'}`} disabled={teamBusy || !teams.length} onClick={() => { setOpen(value => !value); setQuery(''); setError(''); }} title={activeTeamName}>
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand max-[1100px]:hidden"><NavIcon name="people" className="size-4" /></span>
      <span className="min-w-0 flex-1 truncate text-left font-semibold">{activeTeamName || 'Équipes…'}</span>
      {activeTeam && <Chip size="small" label={activeTeam.memberCount} className="bg-white text-brand" sx={{ height: 20, fontSize: 10, '& .MuiChip-label': { px: .6 } }} aria-label={`${activeTeam.memberCount} membres`} />}
      <NavIcon name="chevron" className={`size-3.5 shrink-0 text-muted transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
    </Button>
    {open && <MotionPaper elevation={8} id={panelId} role="region" aria-label="Choisir ou créer une équipe" initial={reducedMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.16 }} className="absolute top-[calc(100%+10px)] left-0 z-50 max-h-[calc(100dvh-76px)] w-88 max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-2xl p-3 max-[650px]:fixed max-[650px]:inset-x-3 max-[650px]:top-14 max-[650px]:w-auto" sx={{ border: 1, borderColor: 'divider', boxShadow: '0 16px 48px #1937521f, 0 2px 8px #1937520a' }}>
      <div className="mb-3 flex items-center justify-between px-1"><div><p className="text-xs font-bold text-ink">Votre espace d’équipe</p><p className="mt-0.5 text-[11px] text-muted">Retrouvez votre collectif et ses rituels.</p></div><span className="rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-semibold text-brand">{teams.length}</span></div>
      <label htmlFor={`${panelId}-search`} className="sr-only">Rechercher une équipe</label>
      <InputBase inputRef={search} id={`${panelId}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher une équipe…" startAdornment={<NavIcon name="search" className="mr-2 size-4 shrink-0 text-muted" />} sx={inputSx} />
      <ul className="mt-2 max-h-[min(15rem,35dvh)] space-y-1 overflow-y-auto overscroll-contain" aria-label="Équipes">
        {results.map(team => <li key={team.id}>
          <Button type="button" disabled={disabled} aria-pressed={team.id === activeTeamId} className={`${focus} rounded-xl ${team.id === activeTeamId ? 'bg-blue-50 text-brand ring-1 ring-inset ring-brand/15' : 'text-ink hover:bg-slate-50'}`} sx={{ minHeight: 48, width: '100%', gap: 1, px: 1, fontSize: 12, textAlign: 'left', textTransform: 'none' }} onClick={() => void select(team.id)}>
            <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${team.id === activeTeamId ? 'bg-brand text-white' : 'bg-slate-100 text-muted'}`}>{team.name.trim().slice(0, 1).toLocaleUpperCase('fr-FR')}</span>
            <span className="min-w-0 flex-1 truncate font-medium" title={team.name}>{team.name}</span>
            <span className="shrink-0 text-[10px] text-muted">{team.memberCount} {team.memberCount === 1 ? 'membre' : 'membres'}</span>
            <span className="w-4 shrink-0 text-brand" aria-hidden="true">{team.id === activeTeamId && <NavIcon name="check" className="size-4" />}</span>
          </Button>
        </li>)}
      </ul>
      {!results.length && <p className="px-2 py-3 text-xs text-muted">Aucune équipe trouvée.</p>}
      <div className="mt-2 border-t border-line pt-2">
        {!creating ? <Button type="button" disabled={disabled} className={`${focus} gap-2 rounded-xl hover:bg-blue-50`} sx={{ minHeight: 44, width: '100%', justifyContent: 'flex-start', px: 1, fontSize: 12, textTransform: 'none' }} onClick={() => { setCreating(true); setError(''); }}><NavIcon name="plus" className="size-4" />Créer une équipe</Button>
          : <form className="flex flex-col gap-2 p-1" onSubmit={event => { event.preventDefault(); void create(); }}>
            <label htmlFor={`${panelId}-name`} className="text-xs font-semibold text-brand">Nom de la nouvelle équipe</label>
            <InputBase id={`${panelId}-name`} type="text" required value={name} onChange={event => setName(event.target.value)} disabled={disabled} error={Boolean(error)} aria-describedby={error ? `${panelId}-error` : undefined} slotProps={{ input: { minLength: 1, maxLength: 60, 'aria-invalid': Boolean(error) } }} sx={inputSx} />
            <div className="flex gap-2">
              <Button type="submit" variant="contained" disabled={disabled} className={`${focus} flex-1`} sx={{ minHeight: 44, fontSize: 12, textTransform: 'none' }}>{pending ? 'Création…' : 'Créer l’équipe'}</Button>
              <Button type="button" disabled={pending} className={focus} sx={{ minHeight: 44, fontSize: 12, textTransform: 'none' }} onClick={() => { setCreating(false); setError(''); }}>Annuler</Button>
            </div>
            <p className="text-[10px] text-muted">Équipe vide : ajoutez ensuite les membres dans Participants.</p>
          </form>}
      </div>
      {error && <Alert id={`${panelId}-error`} severity="error" role="alert" className="mt-1" sx={{ fontSize: 12 }}>{error}</Alert>}
      {pending && <p role="status" className="px-2 py-1 text-xs text-muted">Chargement de l’équipe…</p>}
    </MotionPaper>}
  </div>;
}