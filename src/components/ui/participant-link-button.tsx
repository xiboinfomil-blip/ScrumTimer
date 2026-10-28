'use client';
import { useState } from 'react';
import QRCode from 'react-qr-code';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { useTeam } from '@/providers/team-provider';

export function ParticipantLinkButton() {
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
    setOpen(true); setPending(true); setBaseUrl(''); setLinkName(activeTeamName); setError(''); setCopied(false);
    try {
      const response = await fetch('/api/participant-link', { method: 'POST', headers: { 'X-Team-Id': activeTeamId ?? '' }, signal: AbortSignal.timeout(15_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Lien indisponible.');
      setBaseUrl(data.url);
    } catch (error) { setError(error instanceof Error ? error.message : 'Lien indisponible.'); }
    finally { setPending(false); }
  }
  return <><Button onClick={load} sx={{ minHeight: 44, textTransform: 'none', fontSize: 12 }}>Lien participants</Button>
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md" aria-labelledby="participant-link-title" slotProps={{ paper: { sx: { display: 'flex', flexDirection: 'column', borderRadius: { xs: '14px', sm: '18px' }, m: { xs: 1.5, sm: 3 }, maxHeight: 'calc(100dvh - 24px)' } } }}>
      <DialogTitle id="participant-link-title" className="border-b border-line bg-[linear-gradient(112deg,#f3f8fd_0%,#ffffff_72%,#fff8ef_100%)] px-4 py-4 sm:px-6">
        <span className="flex items-start gap-3"><span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-brand shadow-sm"><QrCode2Rounded /></span><span className="min-w-0"><span aria-hidden="true" className="block text-xs font-semibold text-muted">PORTAIL PARTICIPANTS</span><span className="mt-1 block break-words text-base font-bold text-ink">Portail participants · {activeTeamName}</span></span></span>
      </DialogTitle>
      <DialogContent className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <p className="mb-4 max-w-3xl text-sm leading-relaxed text-muted">Partagez ce lien uniquement avec l’équipe. Il ouvre les notes, statistiques et bilans, sans connexion ni contrôle de la réunion. Toute personne qui le possède peut modifier les notes.</p>
        {pending && <p role="status" className="rounded-lg border border-line bg-slate-50 p-4 text-sm text-muted">Préparation du lien sécurisé…</p>}
        {error && <Alert role="alert" severity="error" action={<Button color="inherit" size="small" onClick={() => void load()}>Réessayer</Button>}>{error}</Alert>}
        {url && <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0">
            <TextField fullWidth size="small" label="Nom de l’équipe dans le lien" value={linkName} onChange={event => { setLinkName(event.target.value); setCopied(false); }} helperText="Modifiez ce nom si besoin. Le lien et le QR code se mettent à jour ensemble." slotProps={{ htmlInput: { maxLength: 80 } }} sx={{ '& .MuiInputBase-root': { minHeight: 44 } }} />
            <label htmlFor="participant-share-url" className="mt-4 block text-xs font-semibold text-ink">Lien à partager</label>
            <input id="participant-share-url" readOnly value={url} onFocus={event => event.currentTarget.select()} aria-describedby="participant-share-hint" className="mt-2 min-h-12 w-full min-w-0 rounded-lg border border-line bg-slate-50 px-3 text-xs text-ink focus-visible:outline-2 focus-visible:outline-brand" />
            <p id="participant-share-hint" className="mt-2 text-xs leading-relaxed text-muted">Le nom est uniquement un repère lisible. L’accès sécurisé reste attaché à l’équipe sélectionnée.</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">Ne publiez pas ce lien. Le changement du secret partagé invalide les liens existants.</p>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-white p-3">
            <p className="text-xs font-semibold text-ink">Scanner pour rejoindre</p>
            <div className="grid aspect-square w-full max-w-[188px] place-items-center rounded-lg bg-white p-2" data-testid="participant-share-qr"><QRCode value={url} size={172} level="M" title={`QR code du lien participant pour ${linkName || activeTeamName}`} className="h-auto w-full max-w-full" /></div>
            <p className="text-center text-[11px] leading-relaxed text-muted">Le QR code ouvre le même lien que le bouton de copie.</p>
          </div>
        </div>}
        {copied && <p role="status" aria-live="polite" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-success">Lien copié dans le presse-papiers.</p>}
      </DialogContent>
      <DialogActions className="flex-wrap border-t border-line px-4 py-3 sm:px-6">
        <Button onClick={() => setOpen(false)} sx={{ minHeight: 44 }}>Fermer</Button>
        {url && <Button variant="contained" startIcon={<ContentCopyRounded />} onClick={async () => { try { await navigator.clipboard.writeText(url); setError(''); setCopied(true); } catch { setCopied(false); setError('Copie indisponible. Sélectionnez le lien pour le copier manuellement.'); } }} sx={{ minHeight: 44, width: { xs: '100%', sm: 'auto' }, ml: { xs: '0 !important', sm: 'auto' } }}>Copier le lien</Button>}
      </DialogActions>
    </Dialog></>;
}