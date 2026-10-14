'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { useTeam } from '@/providers/team-provider';
import { field, primaryButton } from '@/components/ui/styles';

const searchable = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

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
    router.replace('/participants');
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
    router.replace('/participants');
  };

  return <div ref={root} className="relative min-w-0 max-w-52 flex-1 min-[651px]:max-w-44 min-[1500px]:max-w-52">
    <button ref={trigger} type="button" className={`flex h-11 w-full min-w-0 items-center gap-1.5 rounded-lg border border-line bg-white px-2 text-xs text-brand hover:bg-blue-50 disabled:opacity-55 ${focus}`} aria-expanded={open} aria-controls={panelId} aria-label={`Choisir une équipe : ${activeTeamName || 'chargement'}`} disabled={teamBusy || !teams.length} onClick={() => { setOpen(value => !value); setQuery(''); setError(''); }} title={activeTeamName}>
      <span className="min-w-0 flex-1 truncate text-left font-semibold">{activeTeamName || 'Équipes…'}</span>
      {activeTeam && <span className="shrink-0 rounded bg-blue-50 px-1 text-[10px] tabular-nums" aria-label={`${activeTeam.memberCount} membres`}>{activeTeam.memberCount}</span>}
      <span className="shrink-0 text-muted" aria-hidden="true">⌄</span>
    </button>
    {open && <motion.div id={panelId} role="region" aria-label="Choisir ou créer une équipe" initial={reducedMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.16 }} className="absolute top-[calc(100%+8px)] left-0 z-50 w-80 max-w-[calc(100vw-24px)] rounded-xl border border-line bg-white p-2 shadow-xl max-[650px]:fixed max-[650px]:inset-x-3 max-[650px]:top-13 max-[650px]:w-auto">
      <label htmlFor={`${panelId}-search`} className="sr-only">Rechercher une équipe</label>
      <input ref={search} id={`${panelId}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher une équipe…" className={`${field} ${focus} h-11 w-full`} />
      <ul className="mt-1 max-h-60 overflow-y-auto overscroll-contain" aria-label="Équipes">
        {results.map(team => <li key={team.id}>
          <button type="button" disabled={disabled} aria-pressed={team.id === activeTeamId} className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-blue-50 disabled:opacity-50 ${focus} ${team.id === activeTeamId ? 'bg-blue-50 text-brand' : 'text-ink'}`} onClick={() => void select(team.id)}>
            <span className="min-w-0 flex-1 truncate font-medium" title={team.name}>{team.name}</span>
            <span className="shrink-0 text-[10px] text-muted">{team.memberCount} {team.memberCount === 1 ? 'membre' : 'membres'}</span>
            <span className="w-4 shrink-0 text-brand" aria-hidden="true">{team.id === activeTeamId ? '✓' : ''}</span>
          </button>
        </li>)}
      </ul>
      {!results.length && <p className="px-2 py-3 text-xs text-muted">Aucune équipe trouvée.</p>}
      <div className="mt-1 border-t border-line pt-1">
        {!creating ? <button type="button" disabled={disabled} className={`min-h-11 w-full rounded-lg px-2 text-left text-xs font-semibold text-brand hover:bg-blue-50 disabled:opacity-50 ${focus}`} onClick={() => { setCreating(true); setError(''); }}>＋ Créer une équipe</button>
          : <form className="flex flex-col gap-2 p-1" onSubmit={event => { event.preventDefault(); void create(); }}>
            <label htmlFor={`${panelId}-name`} className="text-xs font-semibold text-brand">Nom de la nouvelle équipe</label>
            <input id={`${panelId}-name`} type="text" required minLength={1} maxLength={60} value={name} onChange={event => setName(event.target.value)} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? `${panelId}-error` : undefined} className={`${field} ${focus} h-11 w-full`} />
            <div className="flex gap-2">
              <button type="submit" disabled={disabled} className={`${primaryButton} ${focus} flex-1`}>{pending ? 'Création…' : 'Créer l’équipe'}</button>
              <button type="button" disabled={pending} className={`min-h-11 rounded-lg px-2 text-xs text-muted ${focus}`} onClick={() => { setCreating(false); setError(''); }}>Annuler</button>
            </div>
            <p className="text-[10px] text-muted">Équipe vide : ajoutez ensuite les membres dans Participants.</p>
          </form>}
      </div>
      {error && <p id={`${panelId}-error`} role="alert" className="mt-1 rounded-lg bg-orange-50 p-2 text-xs text-amber-900">{error}</p>}
      {pending && <p role="status" className="px-2 py-1 text-xs text-muted">Chargement de l’équipe…</p>}
    </motion.div>}
  </div>;
}