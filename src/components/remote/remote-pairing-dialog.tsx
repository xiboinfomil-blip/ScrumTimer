'use client';

import { useState } from 'react';
import QRCode from 'react-qr-code';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Button, Button as IconButton } from '@/components/ui/button';
import { ScanQrCode as QrCodeScannerRounded } from 'lucide-react';
import { Smartphone as SmartphoneRounded } from 'lucide-react';
import { Copy as ContentCopyRounded } from 'lucide-react';
import { X as CloseRounded } from 'lucide-react';
import { Unlink as LinkOffRounded } from 'lucide-react';
import type { useTimerRemote } from '@/hooks/remote/use-timer-remote';

export function RemotePairingDialog({ open, anchorEl, onClose, onEnter, onLeave, remote }: { open: boolean; anchorEl: HTMLElement | null; onClose: () => void; onEnter: () => void; onLeave: () => void; remote: ReturnType<typeof useTimerRemote> }) {
  const [copied, setCopied] = useState(false);
  const [origin] = useState(() => typeof location === 'undefined' ? '' : location.origin);
  const link = remote.pair ? `${origin}/remote#${remote.pair.id}.${remote.pair.control}` : '';
  const local = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/.test(origin);
  return <Popover open={open && Boolean(anchorEl)} onOpenChange={next => { if (!next) onClose(); }} modal={false}>
    {anchorEl && <PopoverAnchor virtualRef={{ current: anchorEl }} />}
    <PopoverContent align="end" sideOffset={8} collisionPadding={12} onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => { event.preventDefault(); anchorEl?.focus(); }} onInteractOutside={event => { if (event.target instanceof Node && anchorEl?.contains(event.target)) event.preventDefault(); }} id="remote-pairing-panel" aria-modal={false} aria-labelledby="remote-pairing-title" onPointerEnter={onEnter} onPointerLeave={event => { if (event.pointerType === 'mouse') onLeave(); }} className="z-[2100] flex max-h-[calc(100dvh-120px)] w-80 max-w-[calc(100vw-24px)] flex-col overflow-y-auto rounded-lg border border-line bg-white p-0">
    <header className="flex shrink-0 items-center gap-2 border-t-2 border-t-accent px-5 pt-3 pb-2 text-sm font-bold"><SmartphoneRounded className="text-brand" /><h2 id="remote-pairing-title" className="min-w-0 flex-1">Télécommande mobile</h2><IconButton aria-label="Fermer la connexion mobile" title="Fermer" onClick={onClose} className="size-11" variant="ghost" size="icon"><CloseRounded size={20} /></IconButton></header>
    <div className="min-h-0 overflow-y-auto px-5 py-3">
      {remote.phoneConnected ? <div className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-4 text-sm font-semibold text-success"><span className="size-2 rounded-full bg-success" />Téléphone connecté</div> : link ? <>
        <div className="mx-auto grid size-48 place-items-center rounded-lg border border-line bg-white p-3" data-testid="remote-qr"><QRCode value={link} size={168} level="M" title="Scanner pour ouvrir la télécommande" className="size-full" /></div>
        <Button onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false)); }} variant="ghost" className="mt-[16px] min-h-[48px] w-full"><ContentCopyRounded />{copied ? 'Lien copié' : 'Copier le lien de la télécommande'}</Button>
        {local && <p role="note" className="mt-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">Ce lien localhost ne fonctionne pas sur un autre appareil. Ouvrez d’abord le site avec son adresse réseau accessible au téléphone, ou son adresse HTTPS déployée.</p>}
        {remote.pair?.transport === 'instance' && <p className="mt-2 text-xs leading-relaxed text-muted">Mode serveur unique. Sur un hébergement multi-instance, configurez le transport Redis partagé pour relier les deux appareils.</p>}
        {!remote.phoneEnabled && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs leading-relaxed text-amber-950">Le téléphone précédent est déconnecté. Activez la connexion pour permettre un nouveau scan.</p><Button onClick={() => void remote.enablePhone()} variant="ghost" className="mt-[8px] min-h-[44px] w-full">Réactiver la connexion</Button></div>}
        <p className="mt-3 text-xs leading-relaxed text-muted">Gardez le point quotidien ouvert sur l’ordinateur. Les commandes disponibles suivent sa page active.</p>
      </> : <div className="grid min-h-40 place-content-center justify-items-center gap-4 rounded-lg border border-dashed border-blue-200 bg-blue-50/50 text-brand"><QrCodeScannerRounded size={48} />{!remote.enabled && <Button onClick={remote.toggle} variant="default" className="min-h-[48px]">{remote.status ? 'Réessayer la connexion' : 'Activer le QR de l’équipe'}</Button>}{remote.enabled && <p className="max-w-xs text-center text-sm text-muted">{remote.status || 'Préparation du QR sécurisé…'}</p>}</div>}
      <p role="status" className="mt-4 text-center text-xs text-muted">{remote.status}</p>
    </div>
    {remote.phoneConnected && <footer className="border-t border-line px-5 py-3"><Button onClick={() => void remote.disconnectPhone()} variant="ghost" className="min-h-[44px] normal-case text-danger w-full"><LinkOffRounded />Déconnecter le téléphone</Button></footer>}
    </PopoverContent>
  </Popover>;
}
