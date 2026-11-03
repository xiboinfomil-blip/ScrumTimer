'use client';

import { useState } from 'react';
import QRCode from 'react-qr-code';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import SmartphoneRounded from '@mui/icons-material/SmartphoneRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import type { useTimerRemote } from '@/hooks/remote/use-timer-remote';

export function RemotePairingCard({ remote, onDetails, compact = false }: { remote: ReturnType<typeof useTimerRemote>; onDetails: () => void; compact?: boolean }) {
  const [origin] = useState(() => typeof location === 'undefined' ? '' : location.origin);
  const link = remote.pair ? `${origin}/remote#${remote.pair.id}.${remote.pair.control}` : '';
  return <section aria-labelledby="remote-pairing-card-title" data-testid="remote-pairing-card" className={`flex min-h-0 shrink-0 items-center gap-2 rounded-lg border border-line bg-white p-1.5 ${compact ? '' : 'gap-3 p-2.5 max-[650px]:gap-2 max-[650px]:p-2'}`}>
    <div className={`grid shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-white p-1 ${compact ? 'size-14' : 'size-[76px] max-[650px]:size-[68px]'}`} data-testid="remote-qr">
      {link ? <QRCode value={link} size={compact ? 48 : 68} level="M" title="Scanner pour ouvrir la télécommande" className="size-full" /> : <QrCodeScannerRounded className="text-brand" aria-hidden="true" />}
    </div>
    <div className="flex min-w-0 flex-1 items-center justify-between gap-1">
      <div className="min-w-0">
        <h2 id="remote-pairing-card-title" className="text-[10px] font-bold leading-tight text-ink">Télécommande mobile</h2>
        <p role="status" className="mt-1 line-clamp-2 text-[9px] leading-tight text-muted [@media(max-height:650px)]:hidden">{remote.enabled ? remote.status || 'Préparation du QR sécurisé…' : 'Contrôle mobile désactivé'}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!remote.enabled && <Button size="small" onClick={remote.toggle} sx={{ minHeight: 44, px: 1, fontSize: 10, textTransform: 'none' }}>Activer</Button>}
        <Button size="small" onClick={onDetails} aria-label="Aide sur la télécommande" title="Aide et options" sx={{ minHeight: 44, minWidth: 40, px: 1, fontSize: 10, textTransform: 'none' }}><HelpOutlineRounded fontSize="small" /><span className="ml-1 max-[360px]:hidden">Aide</span></Button>
      </div>
    </div>
  </section>;
}

export function RemotePairingDialog({ open, onClose, remote }: { open: boolean; onClose: () => void; remote: ReturnType<typeof useTimerRemote> }) {
  const [copied, setCopied] = useState(false);
  const [origin] = useState(() => typeof location === 'undefined' ? '' : location.origin);
  const link = remote.pair ? `${origin}/remote#${remote.pair.id}.${remote.pair.control}` : '';
  const local = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/.test(origin);
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="remote-pairing-title" slotProps={{ paper: { sx: { border: '1px solid #dce3e9', borderRadius: '14px', m: 2, width: 'calc(100% - 32px)' } } }}>
    <DialogTitle id="remote-pairing-title" className="flex items-center gap-3 border-t-2 border-t-accent pb-2! text-lg! font-bold!"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-brand"><SmartphoneRounded /></span><span className="min-w-0">Aide de la télécommande mobile</span></DialogTitle>
    <DialogContent>
      <p className="mb-4 text-sm leading-relaxed text-muted">Scannez le QR code toujours visible sur cette page avec l’appareil photo du téléphone, puis ajoutez la télécommande à l’écran d’accueil.</p>
      {link ? <>
        <Button fullWidth startIcon={<ContentCopyRounded />} onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false)); }} sx={{ mt: 2, minHeight: 48 }}>{copied ? 'Lien copié' : 'Copier le lien de la télécommande'}</Button>
        {local && <p role="note" className="mt-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">Ce lien localhost ne fonctionne pas sur un autre appareil. Ouvrez d’abord le site avec son adresse réseau accessible au téléphone, ou son adresse HTTPS déployée.</p>}
        {remote.pair?.transport === 'instance' && <p className="mt-2 text-xs leading-relaxed text-muted">Mode serveur unique. Sur un hébergement multi-instance, configurez le transport Redis partagé pour relier les deux appareils.</p>}
        <p className="mt-3 text-xs leading-relaxed text-muted">Gardez le minuteur ouvert et visible sur l’ordinateur. Toute personne disposant du lien peut contrôler le minuteur lorsqu’il est activé.</p>
      </> : <div className="grid min-h-40 place-content-center justify-items-center gap-4 rounded-3xl border border-dashed border-blue-200 bg-blue-50/50 text-brand"><QrCodeScannerRounded sx={{ fontSize: 48 }} />{!remote.enabled && <Button variant="contained" onClick={remote.toggle} sx={{ minHeight: 48 }}>Activer le QR de l’équipe</Button>}{remote.enabled && <p className="max-w-xs text-center text-sm text-muted">{remote.status || 'Préparation du QR sécurisé…'}</p>}</div>}
      <p role="status" className="mt-4 text-center text-xs text-muted">{remote.status}</p>
    </DialogContent>
    <DialogActions className="flex-wrap gap-2">{remote.enabled && <Button color="error" onClick={remote.toggle} sx={{ minHeight: 44 }}>Désactiver</Button>}<Button variant="contained" onClick={onClose} sx={{ minHeight: 44 }}>Revenir au minuteur</Button></DialogActions>
  </Dialog>;
}