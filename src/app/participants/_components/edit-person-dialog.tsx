'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Person } from '@/types/team';
import { validatePersonName } from '@/lib/action-validation';
import { field, primaryButton, secondaryButton } from '@/components/ui/styles';

export function EditPersonDialog({ person, onSave, onClose }: { person: Person; onSave: (id: string, name: string) => string | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(person.name);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal(); }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    const saveError = validatePersonName(name) ?? onSave(person.id, name.trim());
    if (saveError) { setError(saveError); input.current?.focus(); return; }
    dialog.current?.close();
    onClose();
  }
  return <dialog ref={dialog} aria-labelledby="edit-person-title" onCancel={onClose} onClose={onClose} className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-100 overflow-y-auto rounded-xl border border-line bg-white p-4 text-ink shadow-xl backdrop:bg-ink/40">
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <h2 id="edit-person-title" className="text-base font-semibold">Modifier le nom du participant</h2>
      <label htmlFor="edit-person-name" className="text-sm">Nom du participant</label>
      <input ref={input} id="edit-person-name" className={`${field} min-h-11`} autoComplete="off" required value={name} aria-invalid={!!error} aria-describedby={error ? 'edit-person-error' : undefined} onChange={event => { setName(event.target.value); setError(null); }} />
      {error && <p id="edit-person-error" role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={() => { dialog.current?.close(); onClose(); }}>Annuler</button>
        <button type="submit" className={primaryButton}>Enregistrer</button>
      </div>
    </form>
  </dialog>;
}