'use client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info as NoticeIcon } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';


import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
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
    <Button disabled={disabled} onClick={() => { if (!activeTeamId) return; setDeleting({ id: activeTeamId, name: activeTeamName }); setConfirmation(''); setError(''); }} aria-label={`Supprimer l’équipe ${activeTeamName}`} variant="ghost" className="min-h-[44px] min-w-[0px] text-[11px] normal-case text-danger">Supprimer l’équipe</Button>
    {error && <Alert variant={"destructive"} className="basis-full"><NoticeIcon aria-hidden="true" /><AlertDescription>{error}</AlertDescription></Alert>}
    <Dialog open={Boolean(deleting)} onOpenChange={next => { if (!next) (() => { if (!pending) setDeleting(null); })?.(); }}><DialogContent showCloseButton={false} className="min-h-0 max-w-[600px]" aria-labelledby="delete-team-title" onOpenAutoFocus={event => { event.preventDefault(); (() => confirmationInput.current?.focus())(); }}>
      <DialogTitle id="delete-team-title" className="shrink-0 px-5 pt-5 pb-2">Supprimer définitivement cette équipe ?</DialogTitle>
      <div className="min-h-0 overflow-y-auto px-5 py-3"><p className="mb-3 text-sm text-muted">L’équipe <strong>{deleting?.name}</strong>, ses participants, présences, humeurs, baromètres enregistrés, bilans, retours et questions personnalisées seront supprimés de la base pour tous les appareils. Cette action est irréversible. Les autres équipes et le catalogue partagé sont conservés.</p><div className="grid min-w-0 gap-1.5"><Label htmlFor={'delete-team-confirmation'}>{"Recopiez le nom exact de l’équipe"}</Label><Input id={'delete-team-confirmation'} autoFocus value={confirmation} disabled={pending} onChange={event => setConfirmation(event.target.value)} autoComplete="off" ref={confirmationInput} /></div></div>
      <DialogFooter><Button disabled={pending} onClick={() => setDeleting(null)} variant="ghost" className="min-h-[44px]">Annuler</Button><Button disabled={disabled || deleting?.id !== activeTeamId || confirmation !== deleting?.name} onClick={() => void remove()} variant="destructive" className="min-h-[44px] text-danger">{pending ? 'Suppression…' : 'Supprimer définitivement'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}