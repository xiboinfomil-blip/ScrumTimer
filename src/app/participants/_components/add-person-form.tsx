'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Button, InputBase } from '@mui/material';
import { useTeam } from '@/providers/team-provider';
import { useNotify } from '@/providers/notification-provider';
import { createId } from '@/lib/team-storage';
import { validatePersonName } from '@/lib/action-validation';
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
    <InputBase inputRef={input} sx={{ height: 44, minWidth: 0, fontSize: 14, '& input': { p: 0, height: '100%' } }} className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-slate-50/70 px-3 text-sm text-ink shadow-[inset_0_1px_2px_#19375203] placeholder:text-muted focus-within:border-brand/40 focus-within:bg-white focus-within:shadow-[0_0_0_3px_#205f9d08]" id="checkin-name" placeholder="Ajouter un participant…" autoComplete="off" required inputProps={{ 'aria-invalid': !!error, 'aria-describedby': error ? 'checkin-name-error' : undefined }} value={name} onChange={event => { setName(event.target.value); setError(null); }} />
    <Button disableElevation size="small" variant="contained" sx={{ minHeight: 44, minWidth: 0, textTransform: 'none', fontSize: 12 }} className={`${primaryButton} min-h-11 gap-1.5 rounded-lg`} type="submit" aria-label="Enregistrer cette personne"><ParticipantIcon name="plus" /><span>Ajouter</span></Button>
    </div>
    {error && <p id="checkin-name-error" role="alert" className="w-full text-xs text-danger">{error}</p>}
  </form>;
}