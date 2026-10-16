'use client';

import { Button, Checkbox } from '@mui/material';
import { ParticipantIcon } from './participant-icon';

export function ParticipantsHeading({ total, present, onFresh }: { total: number; present: number; onFresh: () => void }) {
  return <header className="flex shrink-0 items-center justify-between gap-3 px-1">
    <div className="min-w-0">
      <p className="mb-1 flex items-center gap-2 text-xs font-semibold text-brand"><span aria-hidden="true" className="size-2 rounded-full bg-accent" />Étape 1 sur 3 · Les présences</p>
      <h1 className="text-3xl font-bold tracking-tight text-ink max-[650px]:text-xl [@media(max-height:650px)]:text-xl">Qui est là aujourd’hui ?</h1>
      <p className="mt-1 text-sm text-muted max-[650px]:text-xs"><span className="font-semibold text-ink">{present} sur {total}</span> membres présents<span className="max-[650px]:hidden"> · Un moment pour chacun.</span></p>
    </div>
    <button type="button" onClick={onFresh} aria-label="Nouveau bilan" title="Commencer un nouveau bilan" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 text-xs font-semibold text-muted hover:border-brand/30 hover:bg-blue-50 hover:text-brand"><ParticipantIcon name="reset" /><span className="max-[650px]:hidden">Nouveau bilan</span></button>
  </header>;
}

export function ParticipantsToolbar({ total, selectedCount, onSelectAll, onDelete }: { total: number; selectedCount: number; onSelectAll: (checked: boolean) => void; onDelete: () => void }) {
  return <div className={`batch-toolbar flex h-11 shrink-0 items-center gap-3 rounded-xl px-1 text-xs text-muted transition-colors motion-reduce:transition-none max-[650px]:gap-1.5 max-[650px]:text-[11px] ${selectedCount ? 'bg-blue-50 ring-1 ring-inset ring-brand/10' : 'bg-slate-50/70'}`}>
    <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-lg"><Checkbox size="small" sx={{ p: .5, minHeight: 44 }} indeterminate={selectedCount > 0 && selectedCount < total} disabled={!total} checked={total > 0 && selectedCount === total} onChange={event => onSelectAll(event.target.checked)} />Tout sélectionner</label>
    <span className={selectedCount ? 'min-w-0 truncate rounded-md bg-white px-1.5 py-1 text-[10px] font-semibold text-brand' : 'sr-only'} aria-live="polite">{selectedCount}<span className="max-[400px]:sr-only"> sélection{selectedCount === 1 ? '' : 's'}</span></span>
    <Button disableElevation size="small" variant="text" color="error" sx={{ minHeight: 44, minWidth: 0, textTransform: 'none', fontSize: 12 }} type="button" className={`ml-auto inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium text-danger hover:bg-red-50 disabled:cursor-not-allowed max-[650px]:text-[11px] ${selectedCount ? '' : 'invisible'}`} disabled={!selectedCount} onClick={onDelete} aria-label="Supprimer la sélection" title="Supprimer la sélection"><ParticipantIcon name="trash" /><span>Supprimer</span></Button>
  </div>;
}

export function ParticipantsActions({ present, onContinue }: { present: number; onContinue: () => void }) {
  return <div className="wizard-actions flex shrink-0 items-center justify-between gap-3 border-t border-line bg-slate-50/50 px-4 py-3 max-[650px]:px-3 max-[650px]:py-2">
    <p className={`flex items-center gap-2 text-xs max-[650px]:sr-only ${present ? 'text-success' : 'text-muted'}`} aria-live="polite"><span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-xl ${present ? 'bg-success-soft' : 'bg-slate-100'}`}><ParticipantIcon name={present ? 'check' : 'people'} /></span>{present ? `${present} ${present === 1 ? 'personne prête' : 'personnes prêtes'} · Place aux humeurs.` : 'Indiquez au moins une personne présente pour continuer.'}</p>
    <button type="button" className="group inline-flex min-h-11 items-center justify-center gap-3 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50 max-[650px]:w-full" disabled={!present} onClick={onContinue}>Continuer vers les humeurs <ParticipantIcon name="arrow" className="size-4 shrink-0 motion-safe:transition-transform motion-safe:group-hover:translate-x-1" /></button>
  </div>;
}