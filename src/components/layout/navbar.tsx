'use client';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

import { cn } from 'cn';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button as ButtonBase, Button as IconButton } from '@/components/ui/button';
import { motion, useReducedMotion } from 'framer-motion';
import { hasValidSession } from '@/lib/team/team-storage';
import { useTeam } from '@/providers/team-provider';
import { NavIcon } from './nav-icon';
import { Smartphone as SmartphoneRounded } from 'lucide-react';
import { useRemoteHost } from '@/providers/remote-host-provider';
import { AppInstallButton } from './app-install-button';
import { TeamNavbarActions } from './team-navbar-actions';

const steps = [
  { path: '/participants', label: 'Participants', icon: 'people' },
  { path: '/mood', label: 'Humeurs', icon: 'mood' },
  { path: '/timer', label: 'Minuteur', icon: 'timer' },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const { state, activeTeamId, ready, todayRound, cloudStatus, retryCloud } = useTeam();
  const { openPairing, scheduleClosePairing, pairingOpen, remote } = useRemoteHost();
  const currentStep = steps.findIndex(step => step.path === pathname);
  const hasPeople = ready && (Boolean(todayRound) || state.roster.some(person => person.present));
  const canUseTimer = ready && (Boolean(todayRound) || hasValidSession(state));
  const loading = cloudStatus !== 'error' && (!ready || cloudStatus === 'loading');
  const cloudLabel = loading ? 'Connexion…' : cloudStatus === 'saved' ? 'Synchronisé' : cloudStatus === 'saving' ? 'Sauvegarde…' : 'Hors connexion';
  const cloudDescription = cloudStatus === 'saved' ? 'Équipe enregistrée dans Neon.' : loading ? 'Chargement de votre équipe depuis Neon…' : cloudStatus === 'saving' ? 'Enregistrement de l’équipe dans Neon en cours.' : 'Échec de l’enregistrement de l’équipe dans Neon. Réessayez.';
  const cloudTone = cloudStatus === 'error' ? 'text-danger' : loading || cloudStatus === 'saving' ? 'text-amber-800' : 'text-success';
  const utilityClass = 'relative flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold transition-colors motion-reduce:transition-none max-[1100px]:px-2';
  return <header className={cn("text-[#202b36]", "site-header z-[1250] shrink-0 border-b border-line bg-[linear-gradient(90deg,#f7fafc_0%,#ffffff_28%,#ffffff_72%,#f7fafc_100%)] text-ink")}>
    <a href="#main-content" className="absolute top-2 left-3 z-50 -translate-y-24 rounded-xl bg-brand px-4 py-3 text-xs font-semibold text-white focus:translate-y-0">Aller au contenu</a>
    <div className="mx-auto flex min-h-17 w-full items-center gap-4 px-6 max-[1100px]:gap-2 max-[1100px]:px-4 max-[800px]:min-h-0 max-[800px]:flex-wrap max-[800px]:gap-y-0 max-[800px]:px-3 max-[800px]:py-1">
      <Link className="flex min-h-11 shrink-0 items-center rounded-md border-l-2 border-accent pl-3 pr-4 max-[1100px]:pr-1 max-[800px]:pl-2" href="/teams" aria-label="Accueil du point quotidien Infomil Mauritius"><img className="h-8 w-25 object-contain max-[1100px]:w-22 max-[800px]:h-7 max-[800px]:w-17 max-[360px]:w-14" src="/infomil-logo.svg" alt="Infomil Mauritius" width={190} height={60} /></Link>
      <nav aria-label="Navigation du point quotidien" className="mx-auto min-w-0 max-w-144 flex-1 py-1 max-[800px]:order-3 max-[800px]:max-w-none max-[800px]:basis-full max-[800px]:border-t max-[800px]:border-line/70">
        <ol aria-label="Progression du point quotidien" className="grid list-none grid-cols-3 gap-2 max-[800px]:gap-1">
          {steps.map((step, index) => {
            const active = currentStep === index;
            const complete = Boolean(todayRound) || index < currentStep;
            const available = index === 0 || (index === 1 ? hasPeople : canUseTimer);
            const reason = !ready ? 'Chargement de votre équipe…' : index === 1 ? 'Ajoutez au moins une personne présente pour continuer.' : 'Complétez les humeurs et créez le tour de parole pour continuer.';
            const content = <>{active && <motion.span layoutId="navbar-active-step" initial={false} transition={{ duration: reduced ? 0 : .28, ease: [.22, 1, .36, 1] }} className="pointer-events-none absolute inset-x-0 inset-y-1 -z-10 rounded-lg border border-brand/15 bg-blue-50" aria-hidden="true"><span className="absolute inset-x-5 -bottom-px h-0.5 bg-accent" /></motion.span>}<span className={`grid size-8 shrink-0 place-items-center rounded-full border transition-transform duration-200 motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none max-[360px]:size-7 ${active ? 'border-brand bg-brand text-white' : complete ? 'border-green-200 bg-success-soft text-success' : 'border-line bg-white text-muted'}`} aria-hidden="true"><NavIcon name={complete && !active ? 'check' : step.icon} className="size-4" /></span><span className="flex min-w-0 items-baseline gap-1.5"><span aria-hidden="true" className="text-[10px] font-medium tabular-nums text-muted max-[1000px]:hidden">0{index + 1}</span><span className="truncate text-xs font-bold max-[1000px]:text-[11px] max-[360px]:text-[10px]">{step.label}</span></span></>;
            const itemClass = `relative isolate flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-2 transition-colors max-[1000px]:gap-1.5 max-[800px]:min-h-11 max-[360px]:gap-1 max-[360px]:px-0.5 motion-reduce:transition-none ${active ? 'text-brand' : complete ? 'text-success hover:bg-white' : available ? 'text-muted hover:bg-white hover:text-brand' : 'text-muted'}`;
            return <li key={step.path} className="min-w-0" data-step-complete={complete} aria-current={active ? 'step' : undefined}>{available ? <ButtonBase aria-label={step.label} aria-current={active ? 'page' : undefined} className={itemClass} variant="ghost" asChild><Link href={step.path}>{content}</Link></ButtonBase> : <ButtonBase disabled aria-label={`${step.label} — ${reason}`} title={reason} className={itemClass} variant="ghost">{content}</ButtonBase>}</li>;
          })}
        </ol>
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-0.5 border-l border-line pl-3 max-[800px]:pl-2 max-[360px]:pl-1">
        <AppInstallButton />
        {pathname === '/timer' && !todayRound ? <div id="timer-navbar-actions" className="flex shrink-0 items-center" /> : <TeamNavbarActions key={activeTeamId} />}
        {(!ready || !activeTeamId) && <ButtonBase title="Guide d’utilisation" aria-label="Guide d’utilisation" aria-current={pathname === '/help' ? 'page' : undefined} className={`${utilityClass} text-muted hover:bg-slate-100 hover:text-brand`} variant="ghost" asChild><Link href="/help"><NavIcon name="help" /><span className="max-[1400px]:sr-only">Guide</span></Link></ButtonBase>}
        {currentStep >= 0 && <>
          <IconButton id="remote-pairing-button" title={remote.phoneConnected ? 'Déconnecter le téléphone' : 'Télécommande mobile'} aria-label={remote.phoneConnected ? 'Déconnecter le téléphone' : 'Télécommande mobile'} aria-pressed={remote.phoneConnected} aria-haspopup="dialog" aria-expanded={pairingOpen} aria-controls={pairingOpen ? 'remote-pairing-panel' : undefined} onPointerMove={event => { if (event.pointerType === 'mouse' && matchMedia('(hover: hover)').matches) openPairing(); }} onPointerLeave={event => { if (event.pointerType === 'mouse') scheduleClosePairing(); }} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); openPairing(); } }} onClick={() => { if (remote.phoneConnected) void remote.disconnectPhone(); else openPairing(); }} className={`size-11 rounded-lg ${remote.phoneConnected ? 'bg-success-soft text-success ring-1 ring-success/40 hover:bg-red-50 hover:text-danger' : 'text-muted hover:bg-slate-100 hover:text-brand'}`} variant="ghost" size="icon"><SmartphoneRounded size={20} /></IconButton>
        </>}
        <span role="status" title={cloudDescription} aria-label={cloudDescription} className={`ml-1 flex h-8 items-center gap-1.5 px-2 text-[10px] font-semibold max-[1100px]:sr-only ${cloudTone}`}><span aria-hidden="true" className={`size-1.5 rounded-full bg-current ${loading || cloudStatus === 'saving' ? 'motion-safe:animate-pulse' : ''}`} /><span>{cloudLabel}</span></span>
        {cloudStatus === 'error' && <TooltipProvider><Tooltip disableHoverableContent><TooltipTrigger asChild><IconButton onClick={retryCloud} aria-label="Réessayer la sauvegarde Neon" className="size-11 rounded-xl text-danger hover:bg-danger-soft" variant="ghost" size="icon"><NavIcon name="retry" /></IconButton></TooltipTrigger><TooltipContent>{"Réessayer la connexion Neon"}</TooltipContent></Tooltip></TooltipProvider>}
      </div>
    </div>
  </header>;
}