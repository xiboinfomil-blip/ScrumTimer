'use client';
import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { useTeam } from '@/providers/team-provider';

export function ParticipantLinkButton() {
  const { activeTeamId, activeTeamName } = useTeam();
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false);
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [copied, setCopied] = useState(false);
  async function load() {
    setOpen(true); setPending(true); setUrl(''); setError(''); setCopied(false);
    try {
      const response = await fetch('/api/participant-link', { method: 'POST', headers: { 'X-Team-Id': activeTeamId ?? '' }, signal: AbortSignal.timeout(15_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Lien indisponible.');
      setUrl(data.url);
    } catch (error) { setError(error instanceof Error ? error.message : 'Lien indisponible.'); }
    finally { setPending(false); }
  }
  return <><Button onClick={load} sx={{ minHeight: 44, textTransform: 'none', fontSize: 12 }}>Lien participants</Button>
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" aria-labelledby="participant-link-title">
      <DialogTitle id="participant-link-title">Portail participants · {activeTeamName}</DialogTitle>
      <DialogContent><p className="mb-3 text-sm text-muted">Partagez ce lien uniquement avec votre équipe. Il donne accès aux notes partagées, aux statistiques et au bilan, sans connexion ni contrôle de la réunion. Toute personne ayant ce lien peut modifier les notes de cette équipe.</p>
        {pending && <p role="status">Préparation du lien…</p>}{error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {url && <><label htmlFor="participant-share-url" className="text-xs font-semibold">Lien de l’équipe</label><input id="participant-share-url" readOnly value={url} onFocus={event => event.currentTarget.select()} className="mt-2 min-h-11 w-full rounded-xl border border-line p-3 text-xs" /><p className="mt-2 text-xs text-muted">Ne publiez pas ce lien. Le changement du secret partagé invalide tous les liens.</p></>}
        {copied && <p role="status" className="mt-2 text-sm">Lien copié.</p>}
      </DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Fermer</Button>{url && <Button onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setError('Copie indisponible. Sélectionnez et copiez le lien manuellement.'); } }}>Copier le lien</Button>}</DialogActions>
    </Dialog></>;
}