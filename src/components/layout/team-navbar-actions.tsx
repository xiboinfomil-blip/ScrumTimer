'use client';

import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Divider, IconButton, ListItemIcon, Menu, MenuItem, Tooltip } from '@mui/material';
import SettingsRounded from '@mui/icons-material/SettingsRounded';
import VolumeUpRounded from '@mui/icons-material/VolumeUpRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import ManageAccountsRounded from '@mui/icons-material/ManageAccountsRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import { useTeam } from '@/providers/team-provider';
import { useNotify } from '@/providers/notification-provider';
import { freshRound } from '@/lib/team/attendance';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ParticipantLinkButton } from '@/components/ui/participant-link-button';

export function TeamNavbarActions({ timerTools, onOpenChange }: { timerTools?: ReactNode; onOpenChange?: (open: boolean) => void } = {}) {
  const { activeTeamId, activeTeamName, ready, teams, todayRound, teamBusy, cloudStatus, state, updateTeam, setParticipantOrder, resetToday } = useTeam();
  const pathname = usePathname();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [fresh, setFresh] = useState(false);
  const router = useRouter();
  const notify = useNotify();
  const close = () => setAnchor(null);
  useEffect(() => { onOpenChange?.(Boolean(anchor)); }, [anchor, onOpenChange]);
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
    <Tooltip title="Réglages et outils"><IconButton id="navbar-settings-button" aria-label="Réglages et outils" aria-haspopup="menu" aria-expanded={Boolean(anchor)} aria-controls={anchor ? 'team-navbar-menu' : undefined} onClick={event => setAnchor(event.currentTarget)} className={`size-11 rounded-lg! border! transition-colors motion-reduce:transition-none ${anchor ? 'border-brand! bg-blue-50! text-brand!' : 'border-transparent! text-muted! hover:bg-slate-100!'}`}><SettingsRounded fontSize="small" className={`transition-transform duration-300 motion-reduce:transition-none ${anchor ? 'rotate-45' : ''}`} /></IconButton></Tooltip>
    <Menu keepMounted id="team-navbar-menu" anchorEl={anchor} open={Boolean(anchor)} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ list: { onClick: (event: MouseEvent<HTMLUListElement>) => { const item = event.target instanceof Element ? event.target.closest('[role="menuitem"], [role="menuitemcheckbox"]') : null; if (item && item.getAttribute('aria-disabled') !== 'true') close(); }, className: '[&_[role=menuitem]]:min-h-11 [&_[role=menuitem]]:text-sm [&_[role=menuitemcheckbox]]:min-h-11' }, paper: { className: 'mt-2 min-w-64 max-w-[calc(100vw-24px)] rounded-lg! border border-line shadow-lg!' } }}>
      <li role="presentation" className="max-w-72 truncate px-4 py-2 text-xs font-bold text-brand" title={activeTeamName}>{activeTeamName}</li>
      {teams.find(team => team.id === activeTeamId)?.kind !== 'sprint' && <ParticipantLinkButton key={activeTeamId} menuItem onOpen={close} />}
      <MenuItem component={Link} href={`/manage-team?team=${activeTeamId}`} onClick={close} className="min-h-11 text-sm!"><ListItemIcon><ManageAccountsRounded fontSize="small" /></ListItemIcon>Gérer l’équipe</MenuItem>
      <MenuItem disabled={teamBusy || cloudStatus !== 'saved'} onClick={() => { close(); setFresh(true); }} className="min-h-11 text-sm!"><ListItemIcon><RestartAltRounded fontSize="small" /></ListItemIcon>Nouveau bilan</MenuItem>
      <Divider />
      {timerTools}
      {pathname === '/timer' && <MenuItem role="menuitemcheckbox" aria-checked={state.sound} onClick={() => updateTeam(current => ({ ...current, sound: !current.sound }))} className="gap-3 text-sm!"><ListItemIcon><VolumeUpRounded fontSize="small" /></ListItemIcon><span className="flex-1">Alertes sonores</span>{state.sound && <CheckRounded fontSize="small" aria-hidden="true" className="text-brand" />}</MenuItem>}
      <MenuItem component={Link} href="/help" onClick={close} className="min-h-11 text-sm!"><ListItemIcon><HelpOutlineRounded fontSize="small" /></ListItemIcon>Guide d’utilisation</MenuItem>
    </Menu>
    <ConfirmDialog open={fresh} title={todayRound ? 'Réinitialiser le point du jour ?' : 'Commencer un nouveau bilan ?'} description={todayRound ? 'Le bilan et les humeurs d’aujourd’hui seront supprimés pour toute l’équipe, sur tous les appareils. Les équipes, participants et bilans des jours précédents sont conservés.' : 'Votre équipe est conservée. Tout le monde sera marqué présent ; les humeurs, les reports et la progression du minuteur seront effacés pour permettre à chacun de choisir à nouveau.'} confirmLabel={todayRound ? 'Réinitialiser aujourd’hui' : 'Recommencer'} danger={Boolean(todayRound)} onClose={() => setFresh(false)} onConfirm={() => void reset()} />
  </>;
}