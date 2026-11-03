'use client';

import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { Button, IconButton, Paper } from '@mui/material';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import SmartphoneRounded from '@mui/icons-material/SmartphoneRounded';
import { useRemoteHost } from '@/providers/remote-host-provider';

export function TimerRemoteCard({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const { remote, openPairing } = useRemoteHost();
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(location.origin), []);
  const link = remote.pair && origin ? `${origin}/remote#${remote.pair.id}.${remote.pair.control}` : '';

  if (compact) return <div data-testid="timer-remote-shortcut" className={`flex min-h-11 items-center justify-end ${className}`}>
    <Button size="small" variant="outlined" disabled={remote.phoneConnected} onClick={openPairing} startIcon={<SmartphoneRounded />} aria-label={remote.phoneConnected ? 'Téléphone connecté' : 'Télécommande mobile'} title={remote.phoneConnected ? 'Téléphone connecté' : 'Télécommande mobile'} sx={{ minHeight: 44, minWidth: 44, textTransform: 'none', '@media (max-width: 650px)': { width: 44, px: 0, '& .MuiButton-startIcon': { mr: 0 } } }}>
      <span className="max-[650px]:hidden">{remote.phoneConnected ? 'Téléphone connecté' : 'Télécommande mobile'}</span>
    </Button>
  </div>;

  return <Paper component="section" elevation={0} data-testid="remote-pairing-card" aria-labelledby="timer-remote-title" className={`overflow-hidden rounded-lg border border-line bg-white ${className}`}>
    <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
      <h2 id="timer-remote-title" className="flex items-center gap-2 text-xs font-bold text-ink"><QrCode2Rounded className="size-4 text-accent" /> Télécommande mobile</h2>
      <span className={`size-2 rounded-full ${remote.phoneConnected ? 'bg-success' : remote.enabled ? 'bg-accent' : 'bg-slate-300'}`} aria-hidden="true" />
    </div>
    <div className="flex min-w-0 items-center gap-3 p-3">
      {link ? <div data-testid="remote-qr" className="grid size-[88px] shrink-0 place-items-center rounded-md border border-line bg-white p-1.5">
        <QRCode value={link} size={76} level="M" title="QR code de la télécommande mobile" className="size-full" />
      </div> : <div className="grid size-[88px] shrink-0 place-items-center rounded-md bg-slate-50 text-brand">
        {remote.enabled ? <span className="size-5 animate-spin rounded-full border-2 border-brand/20 border-t-brand motion-reduce:animate-none" aria-label="Préparation du QR code" /> : <SmartphoneRounded />}
      </div>}
      <div className="min-w-0 flex-1">
        {remote.phoneConnected ? <>
          <p className="text-xs font-bold text-success">Téléphone connecté</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">Un seul téléphone peut piloter l’équipe.</p>
          <Button size="small" color="error" startIcon={<LinkOffRounded />} onClick={() => void remote.disconnectPhone()} sx={{ mt: .5, minHeight: 36, textTransform: 'none', fontSize: 10 }}>Déconnecter</Button>
        </> : !remote.phoneEnabled && remote.pair ? <>
          <p className="text-xs font-semibold text-ink">Connexion désactivée</p>
          <Button size="small" onClick={() => void remote.enablePhone()} sx={{ mt: .5, minHeight: 36, px: 0, textTransform: 'none', fontSize: 10 }}>Réactiver</Button>
        </> : remote.pair ? <>
          <p className="text-xs font-semibold text-ink">Scannez pour rejoindre</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">Le QR reste le même pour cette équipe.</p>
          <IconButton title={copied ? 'Lien copié' : 'Copier le lien de la télécommande'} aria-label={copied ? 'Lien copié' : 'Copier le lien de la télécommande'} disabled={!link} onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false)); }} sx={{ mt: .5, ml: -.75, width: 36, height: 36, borderRadius: 2, color: '#205f9d' }}><ContentCopyRounded fontSize="small" /></IconButton>
        </> : <>
          <p className="text-xs font-semibold text-ink">{remote.status || 'Préparation du lien sécurisé…'}</p>
          {!remote.enabled && <Button size="small" onClick={remote.toggle} sx={{ mt: .5, minHeight: 36, px: 0, textTransform: 'none', fontSize: 10 }}>Activer le QR</Button>}
        </>}
      </div>
    </div>
  </Paper>;
}