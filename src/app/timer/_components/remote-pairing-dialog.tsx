'use client';

import { useState } from 'react';
import QRCode from 'react-qr-code';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import SmartphoneRounded from '@mui/icons-material/SmartphoneRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import type { useTimerRemote } from '@/hooks/remote/use-timer-remote';

export function RemotePairingDialog({ open, onClose, remote }: { open: boolean; onClose: () => void; remote: ReturnType<typeof useTimerRemote> }) {
  const [copied, setCopied] = useState(false);
  const [origin] = useState(() => typeof location === 'undefined' ? '' : location.origin);
  const link = remote.pair ? `${origin}/remote#${remote.pair.id}.${remote.pair.control}` : '';
  const local = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/.test(origin);
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="remote-pairing-title" slotProps={{ paper: { sx: { border: '1px solid #dce3e9', borderRadius: '14px', m: 2, width: 'calc(100% - 32px)' } } }}>
    <DialogTitle id="remote-pairing-title" className="flex items-center gap-3 border-t-2 border-t-accent pb-2! text-lg! font-bold!"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-brand"><SmartphoneRounded /></span><span className="min-w-0">Votre téléphone, aux commandes</span></DialogTitle>
    <DialogContent>
      <p className="mb-5 text-sm leading-relaxed text-muted">Un seul QR code pour cette équipe, réutilisable à chaque point. Scannez-le avec l’appareil photo, puis ajoutez la télécommande à l’écran d’accueil depuis le téléphone.</p>
      {link ? <>
        <div className="mx-auto w-fit max-w-full rounded-lg border border-line bg-white p-3" data-testid="remote-qr"><QRCode value={link} size={208} level="M" title="Scanner pour ouvrir la télécommande" className="h-auto max-w-full" /></div>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-brand"><span className="size-2 rounded-full bg-success" />QR permanent de l’équipe · réutilisable</div>
        <Button fullWidth startIcon={<ContentCopyRounded />} onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false)); }} sx={{ mt: 2, minHeight: 48 }}>{copied ? 'Lien copié' : 'Copier le lien de la télécommande'}</Button>
        {local && <p role="note" className="mt-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">Ce lien localhost ne fonctionne pas sur un autre appareil. Ouvrez d’abord le site avec son adresse réseau accessible au téléphone, ou son adresse HTTPS déployée.</p>}
        {remote.pair?.transport === 'instance' && <p className="mt-2 text-xs leading-relaxed text-muted">Mode serveur unique. Sur un hébergement multi-instance, configurez le transport Redis partagé pour relier les deux appareils.</p>}
        <p className="mt-3 text-xs leading-relaxed text-muted">Gardez le minuteur ouvert et visible sur l’ordinateur. Désactiver arrête le contrôle pour ce point sans changer le QR code. À la prochaine activation, les téléphones associés retrouvent cette équipe. Toute personne disposant du lien peut contrôler le minuteur lorsqu’il est activé.</p>
      </> : <div className="grid min-h-40 place-content-center justify-items-center gap-4 rounded-3xl border border-dashed border-blue-200 bg-blue-50/50 text-brand"><QrCodeScannerRounded sx={{ fontSize: 48 }} /><Button variant="contained" onClick={remote.toggle} sx={{ minHeight: 48 }}>{remote.enabled ? 'Désactiver pour réessayer' : 'Activer le QR de l’équipe'}</Button></div>}
      <p role="status" className="mt-4 text-center text-xs text-muted">{remote.status}</p>
    </DialogContent>
    <DialogActions className="flex-wrap gap-2">{remote.enabled && <Button color="error" onClick={remote.toggle} sx={{ minHeight: 44 }}>Désactiver</Button>}<Button variant="contained" onClick={onClose} sx={{ minHeight: 44 }}>Revenir au minuteur</Button></DialogActions>
  </Dialog>;
}