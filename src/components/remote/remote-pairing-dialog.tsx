'use client';

import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { Button, Popper, Paper, ClickAwayListener, DialogActions, DialogContent, DialogTitle, IconButton } from '@mui/material';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import SmartphoneRounded from '@mui/icons-material/SmartphoneRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import type { useTimerRemote } from '@/hooks/remote/use-timer-remote';

export function RemotePairingDialog({ open, anchorEl, onClose, onEnter, onLeave, remote }: { open: boolean; anchorEl: HTMLElement | null; onClose: () => void; onEnter: () => void; onLeave: () => void; remote: ReturnType<typeof useTimerRemote> }) {
  const [copied, setCopied] = useState(false);
  const [origin] = useState(() => typeof location === 'undefined' ? '' : location.origin);
  const link = remote.pair ? `${origin}/remote#${remote.pair.id}.${remote.pair.control}` : '';
  const local = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/.test(origin);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); anchorEl?.focus(); }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, onClose, anchorEl]);
  return <Popper open={open && Boolean(anchorEl)} anchorEl={anchorEl} placement="bottom-end" className="z-[1400]" modifiers={[{ name: 'offset', options: { offset: [0, 8] } }, { name: 'preventOverflow', options: { padding: 12 } }]}>
    <ClickAwayListener onClickAway={event => { if (!(event.target instanceof Node && anchorEl?.contains(event.target))) onClose(); }}>
    <Paper id="remote-pairing-panel" role="dialog" aria-modal={false} aria-labelledby="remote-pairing-title" onPointerEnter={onEnter} onPointerLeave={event => { if (event.pointerType === 'mouse') onLeave(); }} elevation={8} className="flex max-h-[calc(100dvh-120px)] w-80 max-w-[calc(100vw-24px)] flex-col overflow-y-auto rounded-lg! border border-line">
    <DialogTitle className="flex items-center gap-2 border-t-2 border-t-accent pb-2! text-sm! font-bold!"><SmartphoneRounded className="text-brand" /><span id="remote-pairing-title" className="min-w-0 flex-1">Télécommande mobile</span><IconButton aria-label="Fermer la connexion mobile" title="Fermer" onClick={onClose} className="size-11"><CloseRounded fontSize="small" /></IconButton></DialogTitle>
    <DialogContent>
      {remote.phoneConnected ? <div className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-4 text-sm font-semibold text-success"><span className="size-2 rounded-full bg-success" />Téléphone connecté</div> : link ? <>
        <div className="mx-auto grid size-48 place-items-center rounded-lg border border-line bg-white p-3" data-testid="remote-qr"><QRCode value={link} size={168} level="M" title="Scanner pour ouvrir la télécommande" className="size-full" /></div>
        <Button fullWidth startIcon={<ContentCopyRounded />} onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false)); }} sx={{ mt: 2, minHeight: 48 }}>{copied ? 'Lien copié' : 'Copier le lien de la télécommande'}</Button>
        {local && <p role="note" className="mt-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">Ce lien localhost ne fonctionne pas sur un autre appareil. Ouvrez d’abord le site avec son adresse réseau accessible au téléphone, ou son adresse HTTPS déployée.</p>}
        {remote.pair?.transport === 'instance' && <p className="mt-2 text-xs leading-relaxed text-muted">Mode serveur unique. Sur un hébergement multi-instance, configurez le transport Redis partagé pour relier les deux appareils.</p>}
        {!remote.phoneEnabled && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs leading-relaxed text-amber-950">Le téléphone précédent est déconnecté. Activez la connexion pour permettre un nouveau scan.</p><Button fullWidth onClick={() => void remote.enablePhone()} sx={{ mt: 1, minHeight: 44 }}>Réactiver la connexion</Button></div>}
        <p className="mt-3 text-xs leading-relaxed text-muted">Gardez le point quotidien ouvert sur l’ordinateur. Les commandes disponibles suivent sa page active.</p>
      </> : <div className="grid min-h-40 place-content-center justify-items-center gap-4 rounded-lg border border-dashed border-blue-200 bg-blue-50/50 text-brand"><QrCodeScannerRounded sx={{ fontSize: 48 }} />{!remote.enabled && <Button variant="contained" onClick={remote.toggle} sx={{ minHeight: 48 }}>{remote.status ? 'Réessayer la connexion' : 'Activer le QR de l’équipe'}</Button>}{remote.enabled && <p className="max-w-xs text-center text-sm text-muted">{remote.status || 'Préparation du QR sécurisé…'}</p>}</div>}
      <p role="status" className="mt-4 text-center text-xs text-muted">{remote.status}</p>
    </DialogContent>
    {remote.phoneConnected && <DialogActions className="border-t border-line"><Button color="error" fullWidth startIcon={<LinkOffRounded />} onClick={() => void remote.disconnectPhone()} sx={{ minHeight: 44, textTransform: 'none' }}>Déconnecter le téléphone</Button></DialogActions>}
    </Paper>
    </ClickAwayListener>
  </Popper>;
}
