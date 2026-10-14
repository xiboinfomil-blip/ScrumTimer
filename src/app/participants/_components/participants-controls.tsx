'use client';

import { useEffect, useRef } from 'react';
import { checkbox, primaryButton } from '@/components/ui/styles';
import { ParticipantIcon } from './participant-icon';
import { WorkflowHeading } from '@/components/ui/workflow-heading';

export function ParticipantsHeading({ total, present, onFresh }: { total: number; present: number; onFresh: () => void }) {
  return <WorkflowHeading step={1} title="Qui est là aujourd’hui ?" description={<><span className="font-semibold text-success">{present} présents</span><span className="mx-1">·</span><span className="text-danger">{total - present} absents</span><span className="max-[650px]:hidden"> · Ajoutez les noms, puis confirmez les présences.</span></>} action={<button type="button" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted hover:bg-white hover:text-brand max-[650px]:text-[11px]" onClick={onFresh} aria-label="Nouveau bilan" title="Commencer un nouveau bilan"><ParticipantIcon name="reset" /><span className="max-[650px]:hidden">Nouveau bilan</span></button>} />;
}

export function ParticipantsToolbar({ total, selectedCount, onSelectAll, onDelete }: { total: number; selectedCount: number; onSelectAll: (checked: boolean) => void; onDelete: () => void }) {
  const selectAll = useRef<HTMLInputElement>(null);
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = selectedCount > 0 && selectedCount < total; }, [selectedCount, total]);
  return <div className="batch-toolbar flex h-11 shrink-0 items-center gap-3 border-b border-line text-xs text-muted max-[650px]:gap-2 max-[650px]:text-[11px]">
    <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg"><input className={checkbox} ref={selectAll} type="checkbox" disabled={!total} checked={total > 0 && selectedCount === total} onChange={event => onSelectAll(event.target.checked)} />Tout sélectionner</label>
    <span className={selectedCount ? 'text-brand' : 'sr-only'} aria-live="polite">{selectedCount} sélection{selectedCount === 1 ? '' : 's'}</span>
    <button type="button" className={`ml-auto inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium text-danger hover:bg-red-50 disabled:cursor-not-allowed max-[650px]:text-[11px] ${selectedCount ? '' : 'invisible'}`} disabled={!selectedCount} onClick={onDelete} aria-label="Supprimer la sélection" title="Supprimer la sélection"><ParticipantIcon name="trash" /><span>Supprimer</span></button>
  </div>;
}

export function ParticipantsActions({ present, onContinue }: { present: number; onContinue: () => void }) {
  return <div className="wizard-actions flex shrink-0 items-center justify-between gap-3 border-t border-line pt-3 max-[650px]:pt-2">
    <p className={`text-xs max-[650px]:sr-only ${present ? 'text-success' : 'text-muted'}`} aria-live="polite">{present ? `✓ ${present} ${present === 1 ? 'personne prête' : 'personnes prêtes'} · Prochaine étape : les humeurs.` : 'Ajoutez une personne présente pour continuer.'}</p>
    <button type="button" className={`${primaryButton} min-h-11 gap-3 max-[650px]:w-full`} disabled={!present} onClick={onContinue}>Continuer vers les humeurs <ParticipantIcon name="arrow" /></button>
  </div>;
}