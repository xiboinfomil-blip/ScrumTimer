'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useTeam } from '@/providers/team-provider';
import { useNotify } from '@/providers/notification-provider';
import { createId } from '@/lib/team-storage';
import { primaryButton } from '@/components/ui/styles';
import { ParticipantIcon } from './participant-icon';

export function AddPersonForm() {
  const [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const { state, updateTeam } = useTeam();
  const notify = useNotify();
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    if (state.roster.length >= 100) { notify('L’équipe est complète (100 personnes maximum).'); return; }
    const person = { id: createId(), name: name.trim().slice(0, 60), present: true, mood: null, moodUpdatedAt: null };
    updateTeam(current => ({ ...current, roster: [...current.roster, person], session: [] }));
    setName('');
    input.current?.focus();
  }
  return <form className="add-person flex w-full shrink-0 items-center gap-2" onSubmit={submit}>
    <label className="sr-only" htmlFor="checkin-name">Nom du membre de l’équipe</label>
    <input ref={input} className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-slate-50/70 px-3 text-sm text-ink shadow-[inset_0_1px_2px_#19375203] placeholder:text-muted focus:border-brand/40 focus:bg-white focus:shadow-[0_0_0_3px_#205f9d08]" id="checkin-name" maxLength={60} placeholder="Ajouter un participant…" autoComplete="off" required value={name} onChange={event => setName(event.target.value)} />
    <button className={`${primaryButton} min-h-11 gap-1.5 rounded-lg`} type="submit" aria-label="Enregistrer cette personne"><ParticipantIcon name="plus" /><span>Ajouter</span></button>
  </form>;
}