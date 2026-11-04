'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Divider, IconButton, ListItemIcon, Menu, MenuItem, Tooltip } from '@mui/material';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import ManageAccountsRounded from '@mui/icons-material/ManageAccountsRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import { useTeam } from '@/providers/team-provider';
import { useNotify } from '@/providers/notification-provider';
import { freshRound } from '@/lib/team/attendance';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ParticipantLinkButton } from '@/components/ui/participant-link-button';

export function TeamNavbarActions() {
  const { activeTeamId, activeTeamName, ready, teams, todayRound, teamBusy, cloudStatus, updateTeam, setParticipantOrder, resetToday } = useTeam();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [fresh, setFresh] = useState(false);
  const router = useRouter();
  const notify = useNotify();
  const close = () => setAnchor(null);
  if (!ready || !activeTeamId) return null;
  const reset = async () => {
    setFresh(false);
    if (todayRound) {
      if (await resetToday()) router.push(`/participants?team=${activeTeamId}`);
    } else if (updateTeam(freshRound)) {
      setParticipantOrder([]);
      notify('Nouveau bilan prêt. Confirmez les présences et choisissez les humeurs du jour.');
      router.push(`/participants?team=${activeTeamId}`);
    }
  };
  return <>
    <Tooltip title={`Actions de l’équipe · ${activeTeamName}`}><IconButton aria-label="Actions de l’équipe" aria-haspopup="menu" aria-expanded={Boolean(anchor)} aria-controls={anchor ? 'team-navbar-menu' : undefined} onClick={event => setAnchor(event.currentTarget)} className="size-11 rounded-lg text-brand hover:bg-blue-50"><GroupsRounded fontSize="small" /></IconButton></Tooltip>
    <Menu keepMounted id="team-navbar-menu" anchorEl={anchor} open={Boolean(anchor)} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { className: 'mt-2 min-w-60 max-w-[calc(100vw-24px)] rounded-lg! border border-line' } }}>
      <li role="presentation" className="max-w-72 truncate px-4 py-2 text-xs font-bold text-brand" title={activeTeamName}>{activeTeamName}</li>
      {teams.find(team => team.id === activeTeamId)?.kind !== 'sprint' && <ParticipantLinkButton key={activeTeamId} menuItem onOpen={close} />}
      <MenuItem component={Link} href={`/manage-team?team=${activeTeamId}`} onClick={close} className="min-h-11 text-sm!"><ListItemIcon><ManageAccountsRounded fontSize="small" /></ListItemIcon>Gérer l’équipe</MenuItem>
      <MenuItem disabled={teamBusy || cloudStatus !== 'saved'} onClick={() => { close(); setFresh(true); }} className="min-h-11 text-sm!"><ListItemIcon><RestartAltRounded fontSize="small" /></ListItemIcon>Nouveau bilan</MenuItem>
      <Divider />
      <MenuItem component={Link} href="/help" onClick={close} className="min-h-11 text-sm!"><ListItemIcon><HelpOutlineRounded fontSize="small" /></ListItemIcon>Guide d’utilisation</MenuItem>
    </Menu>
    <ConfirmDialog open={fresh} title={todayRound ? 'Réinitialiser le point du jour ?' : 'Commencer un nouveau bilan ?'} description={todayRound ? 'Le bilan et les humeurs d’aujourd’hui seront supprimés pour toute l’équipe, sur tous les appareils. Les équipes, participants et bilans des jours précédents sont conservés.' : 'Votre équipe est conservée. Tout le monde sera marqué présent ; les humeurs, les reports et la progression du minuteur seront effacés pour permettre à chacun de choisir à nouveau.'} confirmLabel={todayRound ? 'Réinitialiser aujourd’hui' : 'Recommencer'} danger={Boolean(todayRound)} onClose={() => setFresh(false)} onConfirm={() => void reset()} />
  </>;
}