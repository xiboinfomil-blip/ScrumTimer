'use client';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';


import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuCheckboxItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Button as IconButton } from '@/components/ui/button';
import { Settings as SettingsRounded } from 'lucide-react';
import { Volume2 as VolumeUpRounded } from 'lucide-react';
import { UserRoundCog as ManageAccountsRounded } from 'lucide-react';
import { RotateCcw as RestartAltRounded } from 'lucide-react';
import { CircleHelp as HelpOutlineRounded } from 'lucide-react';
import { useTeam } from '@/providers/team-provider';
import { useNotify } from '@/providers/notification-provider';
import { freshRound } from '@/lib/team/attendance';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ParticipantLinkButton } from '@/components/ui/participant-link-button';

export function TeamNavbarActions({ timerTools, onOpenChange }: { timerTools?: ReactNode; onOpenChange?: (open: boolean) => void } = {}) {
  const { activeTeamId, activeTeamName, ready, teams, todayRound, teamBusy, cloudStatus, state, updateTeam, setParticipantOrder, resetToday } = useTeam();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState(false);
  const router = useRouter();
  const notify = useNotify();
  const close = () => setOpen(false);
  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
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
    <ParticipantLinkButton key={activeTeamId} menuItem onOpen={close}>{participantItem => <DropdownMenu open={open} onOpenChange={setOpen}>
    <TooltipProvider><Tooltip disableHoverableContent><TooltipTrigger asChild><DropdownMenuTrigger asChild><IconButton id="navbar-settings-button" aria-label="Réglages et outils" className={`size-11 rounded-lg! border! transition-colors motion-reduce:transition-none ${open ? 'border-brand! bg-blue-50! text-brand!' : 'border-transparent! text-muted! hover:bg-slate-100!'}`} variant="ghost" size="icon"><SettingsRounded size={20} className={`transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-45' : ''}`} /></IconButton></DropdownMenuTrigger></TooltipTrigger><TooltipContent>Réglages et outils</TooltipContent></Tooltip></TooltipProvider>
    <DropdownMenuContent id="team-navbar-menu" align="end" sideOffset={8} className="min-w-64 max-w-[calc(100vw-24px)]">
      <DropdownMenuLabel className="max-w-72 truncate px-4 py-2 text-xs font-bold text-brand" title={activeTeamName}>{activeTeamName}</DropdownMenuLabel>
      {teams.find(team => team.id === activeTeamId)?.kind !== 'sprint' && participantItem}
      <DropdownMenuItem asChild><Link href={`/manage-team?team=${activeTeamId}`}><ManageAccountsRounded size={20} />Gérer l’équipe</Link></DropdownMenuItem>
      <DropdownMenuItem disabled={teamBusy || cloudStatus !== 'saved'} onSelect={() => setFresh(true)}><RestartAltRounded size={20} />Nouveau bilan</DropdownMenuItem>
      <DropdownMenuSeparator />
      {timerTools}
      {pathname === '/timer' && <DropdownMenuCheckboxItem checked={state.sound} onCheckedChange={sound => updateTeam(current => ({ ...current, sound }))}><VolumeUpRounded size={20} />Alertes sonores</DropdownMenuCheckboxItem>}
      <DropdownMenuItem asChild><Link href="/help"><HelpOutlineRounded size={20} />Guide d’utilisation</Link></DropdownMenuItem>
    </DropdownMenuContent>
    </DropdownMenu>}</ParticipantLinkButton>
    <ConfirmDialog open={fresh} title={todayRound ? 'Réinitialiser le point du jour ?' : 'Commencer un nouveau bilan ?'} description={todayRound ? 'Le bilan et les humeurs d’aujourd’hui seront supprimés pour toute l’équipe, sur tous les appareils. Les équipes, participants et bilans des jours précédents sont conservés.' : 'Votre équipe est conservée. Tout le monde sera marqué présent ; les humeurs, les reports et la progression du minuteur seront effacés pour permettre à chacun de choisir à nouveau.'} confirmLabel={todayRound ? 'Réinitialiser aujourd’hui' : 'Recommencer'} danger={Boolean(todayRound)} onClose={() => setFresh(false)} onConfirm={() => void reset()} />
  </>;
}