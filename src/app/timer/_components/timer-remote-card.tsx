'use client';

import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { Button, Button as IconButton } from '@/components/ui/button';
import { Copy as ContentCopyRounded } from 'lucide-react';
import { Unlink as LinkOffRounded } from 'lucide-react';
import { QrCode as QrCode2Rounded } from 'lucide-react';
import { Smartphone as SmartphoneRounded } from 'lucide-react';
import { useRemoteHost } from '@/providers/remote-host-provider';

export function TimerRemoteCard({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const { remote, openPairing } = useRemoteHost();
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(location.origin), []);
  const link = remote.pair && origin ? `${origin}/remote#${remote.pair.id}.${remote.pair.control}` : '';

  if (compact) return <div data-testid="timer-remote-shortcut" className={`flex min-h-11 items-center justify-end ${className}`}>
    <Button disabled={remote.phoneConnected} onClick={openPairing} aria-label={remote.phoneConnected ? 'Téléphone connecté' : 'Télécommande mobile'} title={remote.phoneConnected ? 'Téléphone connecté' : 'Télécommande mobile'} variant="outline" size="sm" className="min-h-[44px] min-w-[44px] normal-case max-[650px]:w-[44px] max-[650px]:px-[0px]"><SmartphoneRounded />
      <span className="max-[650px]:hidden">{remote.phoneConnected ? 'Téléphone connecté' : 'Télécommande mobile'}</span>
    </Button>
  </div>;

  return <section data-testid="remote-pairing-card" aria-labelledby="timer-remote-title" className={`overflow-hidden rounded-lg border border-line bg-white ${className}`}>
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
          <Button onClick={() => void remote.disconnectPhone()} variant="ghost" size="sm" className="mt-[4px] min-h-[36px] normal-case text-[10px] text-danger"><LinkOffRounded />Déconnecter</Button>
        </> : !remote.phoneEnabled && remote.pair ? <>
          <p className="text-xs font-semibold text-ink">Connexion désactivée</p>
          <Button onClick={() => void remote.enablePhone()} variant="ghost" size="sm" className="mt-[4px] min-h-[36px] px-[0px] normal-case text-[10px]">Réactiver</Button>
        </> : remote.pair ? <>
          <p className="text-xs font-semibold text-ink">Scannez pour rejoindre</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">Le QR reste le même pour cette équipe.</p>
          <IconButton title={copied ? 'Lien copié' : 'Copier le lien de la télécommande'} aria-label={copied ? 'Lien copié' : 'Copier le lien de la télécommande'} disabled={!link} onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false)); }} variant="ghost" size="icon" className="mt-[4px] ml-[-6px] w-[36px] h-[36px] rounded-[8px] text-[#205f9d]"><ContentCopyRounded size={20} /></IconButton>
        </> : <>
          <p className="text-xs font-semibold text-ink">{remote.status || 'Préparation du lien sécurisé…'}</p>
          {!remote.enabled && <Button onClick={remote.toggle} variant="ghost" size="sm" className="mt-[4px] min-h-[36px] px-[0px] normal-case text-[10px]">Activer le QR</Button>}
        </>}
      </div>
    </div>
  </section>;
}