'use client';

import { useEffect, useRef } from 'react';
import { dangerButton, primaryButton, secondaryButton } from './styles';

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirmer', danger = false, onConfirm, onClose }: { open: boolean; title: string; description: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return <dialog className="m-auto w-[calc(100%-32px)] max-w-130 rounded-3xl border border-line bg-white p-6 text-ink shadow-2xl backdrop:bg-ink/40 backdrop:backdrop-blur-sm" ref={ref} aria-label={title} onCancel={onClose} onClose={onClose}><form method="dialog"><h2 className="text-xl font-bold">{title}</h2><p className="my-4 text-sm leading-relaxed">{description}</p><div className="flex justify-end gap-3"><button className={secondaryButton} value="cancel">Annuler</button><button className={danger ? dangerButton : primaryButton} value="confirm" onClick={onConfirm}>{confirmLabel}</button></div></form></dialog>;
}