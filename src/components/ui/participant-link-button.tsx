'use client';


import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info as NoticeIcon } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';

import { cn } from 'cn';

import { useState, type ReactNode } from 'react';
import QRCode from 'react-qr-code';
import { Copy as ContentCopyRounded } from 'lucide-react';
import { QrCode as QrCode2Rounded } from 'lucide-react';
import { RotateCcw as RestartAltRounded } from 'lucide-react';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useTeam } from '@/providers/team-provider';

export function ParticipantLinkButton({ compact = false, menuItem = false, onOpen, children }: { compact?: boolean; menuItem?: boolean; onOpen?: () => void; children?: (trigger: ReactNode) => ReactNode }) {
  const { activeTeamId, activeTeamName } = useTeam();
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false);
  const [baseUrl, setBaseUrl] = useState(''), [linkName, setLinkName] = useState(activeTeamName), [error, setError] = useState(''), [copied, setCopied] = useState(false);
  const url = baseUrl ? (() => {
    const link = new URL(baseUrl);
    const label = linkName.trim();
    if (label) link.searchParams.set('equipe', label);
    else link.searchParams.delete('equipe');
    return link.href;
  })() : '';
  async function load() {
    onOpen?.();
    setOpen(true); setPending(true); setBaseUrl(''); setLinkName(activeTeamName); setError(''); setCopied(false);
    try {
      const response = await fetch('/api/participant-link', { method: 'POST', headers: { 'X-Team-Id': activeTeamId ?? '' }, signal: AbortSignal.timeout(15_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Lien indisponible.');
      setBaseUrl(data.url);
    } catch (error) { setError(error instanceof Error ? error.message : 'Lien indisponible.'); }
    finally { setPending(false); }
  }
  const trigger = menuItem ? <DropdownMenuItem onSelect={() => void load()}><QrCode2Rounded size={20} />Lien participants</DropdownMenuItem> : <Button onClick={load} aria-label="Lien participants" title="Lien participants" className={cn("min-h-[44px] normal-case text-[12px]", compact ? 'max-[650px]:min-w-11 max-[650px]:px-0' : undefined)} variant="outline"><QrCode2Rounded /><span className={compact ? 'max-[650px]:sr-only' : undefined}>Lien participants</span></Button>;
  return <>{children ? children(trigger) : trigger}
    <Dialog open={open} onOpenChange={next => { if (!next) (() => setOpen(false))?.(); }}><DialogContent showCloseButton={false} className="min-h-0 flex flex-col rounded-[14px] sm:rounded-[18px] max-h-[calc(100dvh_-_24px)] max-w-[900px]" aria-labelledby="participant-link-title">
      <DialogTitle id="participant-link-title" className={cn("shrink-0 px-5 pt-5 pb-2", "border-b border-line border-t-2 border-t-accent bg-white px-4 py-4 sm:px-6")}>
        <span className="flex items-start gap-3"><span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-brand"><QrCode2Rounded /></span><span className="min-w-0"><span aria-hidden="true" className="block text-[10px] font-bold uppercase text-muted">PARTAGE D’ÉQUIPE</span><span className="mt-1 block break-words text-base font-bold text-ink">Portail participants · {activeTeamName}</span></span></span>
      </DialogTitle>
      <div className={cn("min-h-0 overflow-y-auto px-5 py-3", "min-h-0 overflow-y-auto bg-[#f8fafb] px-4 py-4 sm:px-6 sm:py-5")}>
        <p className="mb-4 max-w-3xl text-sm leading-relaxed text-muted">Partagez ce lien avec l’équipe. Il ouvre les notes, statistiques et bilans, sans connexion ni contrôle de la réunion. Toute personne qui le possède peut modifier les notes.</p>
        {pending && <p role="status" className="rounded-lg border border-line bg-slate-50 p-4 text-sm text-muted">Préparation du lien sécurisé…</p>}
        {error && <Alert variant={"destructive"} role="alert"><NoticeIcon aria-hidden="true" /><AlertDescription>{error}</AlertDescription><div className="col-start-2 mt-1">{<Button onClick={() => void load()} variant="ghost" size="sm">Réessayer</Button>}</div></Alert>}
        {url && <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-white p-2 md:col-start-2 md:row-start-1 md:p-3">
            <p className="text-xs font-semibold text-ink">Scanner pour rejoindre</p>
            <div className="grid aspect-square w-full max-w-[148px] place-items-center rounded-lg bg-white p-1.5 md:max-w-[188px] md:p-2" data-testid="participant-share-qr"><QRCode value={url} size={172} level="M" title={`QR code du lien participant pour ${linkName || activeTeamName}`} className="h-auto w-full max-w-full" /></div>
            <p className="text-center text-[11px] leading-relaxed text-muted">Le QR code ouvre le même lien que le bouton de copie.</p>
          </div>
          <div className="min-w-0 md:col-start-1 md:row-start-1">
            <div className="grid min-w-0 gap-1.5"><Label htmlFor={'participant-share-name'}>{"Nom d’équipe dans le lien"}</Label><Input id={'participant-share-name'} value={linkName} onChange={event => { setLinkName(event.target.value); setCopied(false); setError(''); }} aria-describedby={'participant-share-name-hint'} maxLength={80} /><p id={'participant-share-name-hint'} className="text-xs text-muted">{"Modifiez ce nom : le lien et le QR code se mettent à jour ensemble."}</p></div>
            <Button type="button" disabled={linkName === activeTeamName} onClick={() => { setLinkName(activeTeamName); setCopied(false); setError(''); }} variant="ghost" className="mt-[4px] min-h-[44px] normal-case text-[12px]"><RestartAltRounded />Utiliser le nom de l’équipe</Button>
            <label htmlFor="participant-share-url" className="mt-4 block text-xs font-semibold text-ink">Lien à partager</label>
            <Input id="participant-share-url" readOnly value={url} onFocus={event => event.currentTarget.select()} aria-describedby="participant-share-hint" className="mt-2 min-h-12 w-full min-w-0 rounded-lg border border-control bg-slate-50 px-3 text-xs text-ink focus-visible:outline-2 focus-visible:outline-brand" />
            <p id="participant-share-hint" className="mt-2 text-xs leading-relaxed text-muted">Le nom est uniquement un repère lisible. L’accès sécurisé reste attaché à l’équipe sélectionnée.</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">Ne publiez pas ce lien. Le changement du secret partagé invalide les liens existants.</p>
          </div>
        </div>}
        {copied && <p role="status" aria-live="polite" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-success">Lien copié dans le presse-papiers.</p>}
      </div>
      <DialogFooter className="flex-wrap border-t border-line px-4 py-3 sm:px-6">
        <Button onClick={() => setOpen(false)} variant="ghost" className="min-h-[44px]">Fermer</Button>
        {url && <Button onClick={async () => { try { await navigator.clipboard.writeText(url); setError(''); setCopied(true); } catch { setCopied(false); setError('Copie indisponible. Sélectionnez le lien pour le copier manuellement.'); } }} variant="default" className="min-h-11 w-full sm:ml-auto sm:w-auto"><ContentCopyRounded />Copier le lien</Button>}
      </DialogFooter>
    </DialogContent></Dialog></>;
}