'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Button, Dialog, InputBase } from '@mui/material';
import type { Person } from '@/types/team';
import { validatePersonName } from '@/lib/team/action-validation';
import { field, primaryButton, secondaryButton } from '@/components/ui/styles';

export function EditPersonDialog({ person, onSave, onClose }: { person: Person; onSave: (id: string, name: string) => string | null; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(person.name);
  const [error, setError] = useState<string | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    const saveError = validatePersonName(name) ?? onSave(person.id, name.trim());
    if (saveError) { setError(saveError); input.current?.focus(); return; }
    onClose();
  }
  return <Dialog open onClose={onClose} aria-labelledby="edit-person-title" maxWidth={false} slotProps={{ paper: { className: 'text-ink', sx: { m: 2, width: 'calc(100% - 32px)', maxWidth: 400, maxHeight: 'calc(100dvh - 32px)', p: 2, borderRadius: '16px' } } }}>
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <h2 id="edit-person-title" className="text-base font-semibold">Modifier le nom du participant</h2>
      <label htmlFor="edit-person-name" className="text-sm">Nom du participant</label>
      <InputBase inputRef={input} autoFocus id="edit-person-name" sx={{ minHeight: 44, fontSize: 14, '& input': { p: 0 } }} className={`${field} min-h-11 focus-within:outline-2 focus-within:outline-brand`} autoComplete="off" required value={name} inputProps={{ 'aria-invalid': !!error, 'aria-describedby': error ? 'edit-person-error' : undefined }} onChange={event => { setName(event.target.value); setError(null); }} />
      {error && <p id="edit-person-error" role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button disableElevation size="small" variant="outlined" sx={{ minHeight: 44, textTransform: 'none' }} type="button" className={secondaryButton} onClick={onClose}>Annuler</Button>
        <Button disableElevation size="small" variant="contained" sx={{ minHeight: 44, textTransform: 'none' }} type="submit" className={primaryButton}>Enregistrer</Button>
      </div>
    </form>
  </Dialog>;
}