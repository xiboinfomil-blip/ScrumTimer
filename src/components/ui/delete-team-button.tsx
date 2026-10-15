'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { useTeam } from '@/providers/team-provider';

export function DeleteTeamButton() {
  const { activeTeamId, activeTeamName, deleteTeam, ready, teamBusy, cloudStatus } = useTeam();
  const router = useRouter();
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const confirmationInput = useRef<HTMLInputElement>(null);
  const disabled = !ready || teamBusy || pending || cloudStatus !== 'saved' || !activeTeamId;

  async function remove() {
    if (!deleting || disabled || deleting.id !== activeTeamId || confirmation !== deleting.name) return;
    setPending(true); setError('');
    const success = await deleteTeam(deleting.id, deleting.name);
    setPending(false); setDeleting(null); setConfirmation('');
    if (success) router.replace('/teams');
    else setError('Suppression non confirmée. Réessayez la connexion Neon avant de continuer.');
  }

  return <>
    <Button color="error" disabled={disabled} onClick={() => { if (!activeTeamId) return; setDeleting({ id: activeTeamId, name: activeTeamName }); setConfirmation(''); setError(''); }} aria-label={`Supprimer l’équipe ${activeTeamName}`} sx={{ minHeight: 44, minWidth: 0, fontSize: 11, textTransform: 'none' }}>Supprimer l’équipe</Button>
    {error && <Alert severity="error" className="basis-full">{error}</Alert>}
    <Dialog open={Boolean(deleting)} onClose={() => { if (!pending) setDeleting(null); }} slotProps={{ transition: { onEntered: () => confirmationInput.current?.focus() } }} fullWidth maxWidth="sm" aria-labelledby="delete-team-title">
      <DialogTitle id="delete-team-title">Supprimer définitivement cette équipe ?</DialogTitle>
      <DialogContent><p className="mb-3 text-sm text-muted">L’équipe <strong>{deleting?.name}</strong>, ses participants, présences, humeurs, baromètres enregistrés, bilans, retours et questions personnalisées seront supprimés de la base pour tous les appareils. Cette action est irréversible. Les autres équipes et le catalogue partagé sont conservés.</p><TextField inputRef={confirmationInput} autoFocus fullWidth label="Recopiez le nom exact de l’équipe" value={confirmation} disabled={pending} onChange={event => setConfirmation(event.target.value)} autoComplete="off" /></DialogContent>
      <DialogActions><Button disabled={pending} onClick={() => setDeleting(null)} sx={{ minHeight: 44 }}>Annuler</Button><Button color="error" variant="contained" disabled={disabled || deleting?.id !== activeTeamId || confirmation !== deleting?.name} onClick={() => void remove()} sx={{ minHeight: 44 }}>{pending ? 'Suppression…' : 'Supprimer définitivement'}</Button></DialogActions>
    </Dialog>
  </>;
}