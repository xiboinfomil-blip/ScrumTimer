'use client';
import { Input } from '@/components/ui/input';

import { Dialog, DialogContent } from '@/components/ui/dialog';

import { cn } from 'cn';


import { useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
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
  return <Dialog open={true} onOpenChange={next => { if (!next) (onClose)?.(); }}><DialogContent showCloseButton={false} className="min-h-0 w-[calc(100%_-_32px)] max-w-[400px] max-h-[calc(100dvh_-_32px)] p-[16px] rounded-[16px] text-ink" aria-labelledby="edit-person-title">
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <h2 id="edit-person-title" className="text-base font-semibold">Modifier le nom du participant</h2>
      <label htmlFor="edit-person-name" className="text-sm">Nom du participant</label>
      <Input autoFocus id="edit-person-name" className={`${field} min-h-11 focus-within:outline-2 focus-within:outline-brand`} autoComplete="off" required value={name} onChange={event => { setName(event.target.value); setError(null); }} ref={input} {...{ 'aria-invalid': !!error, 'aria-describedby': error ? 'edit-person-error' : undefined }} />
      {error && <p id="edit-person-error" role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" className={cn("min-h-[44px] normal-case", secondaryButton)} onClick={onClose} variant="outline" size="sm">Annuler</Button>
        <Button type="submit" className={cn("min-h-[44px] normal-case", primaryButton)} variant="default" size="sm">Enregistrer</Button>
      </div>
    </form>
  </DialogContent></Dialog>;
}