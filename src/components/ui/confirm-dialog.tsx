'use client';
import { useId } from 'react';
import { Button } from './button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog';
export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirmer', danger = false, onConfirm, onClose }: { open: boolean; title: string; description: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  const descriptionId = useId();
  return <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}><DialogContent showCloseButton={false} aria-describedby={descriptionId}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription id={descriptionId} className="text-[13px] leading-relaxed">{description}</DialogDescription></DialogHeader><DialogFooter><Button onClick={onClose} variant="outline" autoFocus>Annuler</Button><Button variant={danger ? 'destructive' : 'default'} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button></DialogFooter></DialogContent></Dialog>;
}