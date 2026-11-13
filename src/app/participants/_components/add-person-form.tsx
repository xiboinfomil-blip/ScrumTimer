'use client';
import { Input } from '@/components/ui/input';

import { cn } from 'cn';


import { useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { useTeam } from '@/providers/team-provider';
import { useNotify } from '@/providers/notification-provider';
import { createId } from '@/lib/team/team-storage';
import { validatePersonName } from '@/lib/team/action-validation';
import { primaryButton } from '@/components/ui/styles';
import { ParticipantIcon } from './participant-icon';

export function AddPersonForm() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { state, updateTeam } = useTeam();
  const notify = useNotify();
  function submit(event: FormEvent) {
    event.preventDefault();
    const validationError = validatePersonName(name);
    if (validationError) { setError(validationError); input.current?.focus(); return; }
    if (state.roster.length >= 100) { setError('L’équipe est complète (100 personnes maximum).'); return; }
    const person = { id: createId(), name: name.trim(), present: true, mood: null, moodUpdatedAt: null };
    if (!updateTeam(current => current.roster.length >= 100 ? current : ({ ...current, roster: [...current.roster, person], session: [] }))) { setError('Ajout impossible. Réessayez après le chargement de l’équipe.'); return; }
    setError(null);
    setName('');
    notify(`${person.name} ajouté(e) à l’équipe.`);
    input.current?.focus();
  }
  return <form className="add-person flex w-full shrink-0 flex-col gap-1" onSubmit={submit} noValidate>
    <div className="flex w-full items-center gap-2">
    <label className="sr-only" htmlFor="checkin-name">Nom du membre de l’équipe</label>
    <div className={`flex h-11 min-w-0 flex-1 items-center rounded-xl border bg-white px-3 text-sm text-ink placeholder:text-muted focus-within:bg-white ${error ? 'border-danger ring-2 ring-danger/10' : 'border-slate-200 focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/10'}`}>{<span className="mr-2 shrink-0 text-muted max-[360px]:hidden"><ParticipantIcon name="people" /></span>}<Input id="checkin-name" placeholder="Prénom et nom…" autoComplete="off" required value={name} onChange={event => { setName(event.target.value); setError(null); }} ref={input} {...{ 'aria-invalid': !!error, 'aria-describedby': error ? 'checkin-name-error' : undefined }} className="h-11 flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" /></div>
    <Button className={cn("min-h-[44px] min-w-[0px] normal-case text-[12px]", `${primaryButton} min-h-11 gap-1.5 rounded-xl`)} type="submit" aria-label="Enregistrer cette personne" variant="default" size="sm"><ParticipantIcon name="plus" /><span>Ajouter</span></Button>
    </div>
    {error && <p id="checkin-name-error" role="alert" className="w-full text-xs text-danger">{error}</p>}
  </form>;
}