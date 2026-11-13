'use client';


import { cn } from 'cn';


import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ParticipantIcon } from './participant-icon';

export function ParticipantsHeading({ total, present }: { total: number; present: number }) {
  return <header className="relative flex shrink-0 items-center justify-between gap-3 border-b border-line pb-3 motion-safe:animate-page-reveal max-[650px]:pb-1 [@media(max-height:650px)]:pb-0">
    <div className="min-w-0 flex-1">
      <p className="mb-1 hidden items-center gap-2 text-[10px] font-semibold uppercase text-muted min-[651px]:flex"><span aria-hidden="true" className="size-2 rounded-sm bg-accent" />Étape 01 <span aria-hidden="true" className="text-line">/</span> Votre équipe</p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h1 tabIndex={-1} className="text-2xl leading-tight font-bold text-ink max-[650px]:text-xl">Présences<span aria-hidden="true" className="text-accent">.</span></h1>
        <p className="text-xs text-muted"><span className="font-semibold tabular-nums text-ink">{present} sur {total}</span><span className="max-[650px]:hidden"> membres présents</span></p>
      </div>
      <div aria-hidden="true" className="mt-2 h-1 max-w-64 overflow-hidden rounded-full bg-slate-100 max-[650px]:hidden"><div className="h-full rounded-full bg-success motion-safe:transition-[width] motion-reduce:transition-none" style={{ width: `${total ? Math.round((present / total) * 100) : 0}%` }} /></div>
    </div>
  </header>;
}

export function ParticipantsToolbar({ total, selectedCount, onSelectAll, onDelete }: { total: number; selectedCount: number; onSelectAll: (checked: boolean) => void; onDelete: () => void }) {
  return <div className={`batch-toolbar flex h-11 shrink-0 items-center gap-3 rounded-xl px-1 text-xs text-muted transition-colors motion-reduce:transition-none max-[650px]:gap-1.5 max-[650px]:text-[11px] ${selectedCount ? 'bg-blue-50 ring-1 ring-inset ring-brand/10' : 'bg-slate-50/70'}`}>
    <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-lg"><Checkbox checked={selectedCount > 0 && selectedCount < total ? 'indeterminate' : total > 0 && selectedCount === total} disabled={!total} onCheckedChange={checked => onSelectAll(checked === true)} />Tout sélectionner</label>
    <span className={selectedCount ? 'min-w-0 truncate rounded-md bg-white px-1.5 py-1 text-[10px] font-semibold text-brand' : 'sr-only'} aria-live="polite">{selectedCount}<span className="max-[400px]:sr-only"> sélection{selectedCount === 1 ? '' : 's'}</span></span>
    <Button type="button" className={cn("min-h-[44px] min-w-[0px] normal-case text-[12px] text-danger", `ml-auto inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium text-danger hover:bg-red-50 disabled:cursor-not-allowed max-[650px]:text-[11px] ${selectedCount ? '' : 'invisible'}`)} disabled={!selectedCount} onClick={onDelete} aria-label="Supprimer la sélection" title="Supprimer la sélection" variant="ghost" size="sm"><ParticipantIcon name="trash" /><span>Supprimer</span></Button>
  </div>;
}

export function ParticipantsActions({ present, onContinue }: { present: number; onContinue: () => void }) {
  return <div className="wizard-actions flex shrink-0 items-center justify-between gap-3 border-t border-line bg-white px-4 py-3 max-[650px]:px-3 max-[650px]:py-2">
    <p className={`flex items-center gap-2 text-xs max-[650px]:sr-only ${present ? 'text-success' : 'text-muted'}`} aria-live="polite"><span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-xl ${present ? 'bg-success-soft' : 'bg-slate-100'}`}><ParticipantIcon name={present ? 'check' : 'people'} /></span>{present ? `${present} ${present === 1 ? 'personne prête' : 'personnes prêtes'} · Place aux humeurs.` : 'Indiquez au moins une personne présente pour continuer.'}</p>
    <Button type="button" className="group inline-flex min-h-11 items-center justify-center gap-3 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-muted max-[650px]:w-full" disabled={!present} onClick={onContinue} variant="ghost">Continuer vers les humeurs <ParticipantIcon name="arrow" className="size-4 shrink-0 motion-safe:transition-transform motion-safe:group-hover:translate-x-1" /></Button>
  </div>;
}