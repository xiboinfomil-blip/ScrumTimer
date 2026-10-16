'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppBar, ButtonBase, IconButton, Tooltip } from '@mui/material';
import { motion, useReducedMotion } from 'framer-motion';
import { hasValidSession } from '@/lib/team-storage';
import { useTeam } from '@/providers/team-provider';
import { TeamSwitcher } from './team-switcher';
import { NavIcon } from './nav-icon';

const steps = [
  { path: '/participants', label: 'Participants', icon: 'people' },
  { path: '/mood', label: 'Humeurs', icon: 'mood' },
  { path: '/timer', label: 'Minuteur', icon: 'timer' },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const { state, ready, todayRound, cloudStatus, retryCloud, updateTeam } = useTeam();
  const currentStep = steps.findIndex(step => step.path === pathname);
  const hasPeople = ready && (Boolean(todayRound) || state.roster.some(person => person.present));
  const canUseTimer = ready && (Boolean(todayRound) || hasValidSession(state));
  const loading = cloudStatus !== 'error' && (!ready || cloudStatus === 'loading');
  const cloudLabel = loading ? 'Connexion…' : cloudStatus === 'saved' ? 'Synchronisé' : cloudStatus === 'saving' ? 'Sauvegarde…' : 'Hors connexion';
  const cloudDescription = cloudStatus === 'saved' ? 'Équipe enregistrée dans Neon.' : loading ? 'Chargement de votre équipe depuis Neon…' : cloudStatus === 'saving' ? 'Enregistrement de l’équipe dans Neon en cours.' : 'Échec de l’enregistrement de l’équipe dans Neon. Réessayez.';
  const cloudTone = cloudStatus === 'error' ? 'text-danger' : loading || cloudStatus === 'saving' ? 'text-amber-800' : 'text-success';
  const utilityClass = 'relative flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors motion-reduce:transition-none max-[1100px]:px-2';
  return <AppBar component="header" position="relative" color="transparent" elevation={0} className="site-header z-20 shrink-0 border-b border-line bg-white/95 text-ink backdrop-blur-xl" sx={{ color: 'text.primary' }}>
    <a href="#main-content" className="absolute top-2 left-3 z-50 -translate-y-24 rounded-xl bg-brand px-4 py-3 text-xs font-semibold text-white focus:translate-y-0">Aller au contenu</a>
    <div className="mx-auto flex min-h-17 w-full max-w-480 items-center gap-4 px-6 max-[1100px]:gap-2 max-[1100px]:px-4 max-[800px]:min-h-0 max-[800px]:flex-wrap max-[800px]:gap-y-0 max-[800px]:px-3 max-[800px]:py-1">
      <Link className="flex min-h-11 shrink-0 items-center rounded-lg pr-4 max-[1100px]:pr-1 min-[1101px]:border-r min-[1101px]:border-line" href="/teams" aria-label="Accueil du point quotidien Infomil Mauritius"><img className="h-8 w-25 object-contain max-[1100px]:w-22 max-[800px]:h-7 max-[800px]:w-17 max-[360px]:w-14" src="/infomil-logo.svg" alt="Infomil Mauritius" width={190} height={60} /></Link>
      <TeamSwitcher />
      <nav aria-label="Navigation du point quotidien" className="mx-auto min-w-0 max-w-132 flex-1 max-[800px]:order-3 max-[800px]:max-w-none max-[800px]:basis-full max-[800px]:border-t max-[800px]:border-line/70">
        <ol aria-label="Progression du point quotidien" className="grid list-none grid-cols-3 gap-1">
          {steps.map((step, index) => {
            const active = currentStep === index;
            const complete = Boolean(todayRound) || index < currentStep;
            const available = index === 0 || (index === 1 ? hasPeople : canUseTimer);
            const reason = !ready ? 'Chargement de votre équipe…' : index === 1 ? 'Ajoutez au moins une personne présente pour continuer.' : 'Complétez les humeurs et créez le tour de parole pour continuer.';
            const content = <><motion.span initial={false} animate={{ backgroundColor: active ? '#205f9d' : complete ? '#edf9f2' : '#f1f5f9', color: active ? '#ffffff' : complete ? '#147d52' : '#65798d' }} transition={{ duration: reduced ? 0 : .2 }} className="grid size-6 shrink-0 place-items-center rounded-lg" aria-hidden="true"><NavIcon name={complete && !active ? 'check' : step.icon} className="size-3.5" /></motion.span><span className="truncate text-xs font-semibold max-[1000px]:text-[11px] max-[360px]:text-[10px]">{step.label}</span>{active && <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-accent" aria-hidden="true" />}</>;
            const itemClass = `relative flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-2 transition-colors max-[1000px]:gap-1.5 max-[360px]:gap-1 max-[360px]:px-0.5 motion-reduce:transition-none ${active ? 'bg-blue-50/70 text-brand' : complete ? 'text-success hover:bg-slate-50' : available ? 'text-muted hover:bg-slate-50 hover:text-brand' : 'text-slate-400'}`;
            return <li key={step.path} className="min-w-0" data-step-complete={complete} aria-current={active ? 'step' : undefined}>{available ? <ButtonBase component={Link} href={step.path} aria-label={step.label} aria-current={active ? 'page' : undefined} className={itemClass}>{content}</ButtonBase> : <ButtonBase disabled aria-label={`${step.label} — ${reason}`} title={reason} className={itemClass}>{content}</ButtonBase>}</li>;
          })}
        </ol>
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <ButtonBase component={Link} href="/help" title="Guide d’utilisation" aria-label="Guide d’utilisation" aria-current={pathname === '/help' ? 'page' : undefined} className={`${utilityClass} ${pathname === '/help' ? 'bg-blue-50 text-brand ring-1 ring-brand/15' : 'text-muted hover:bg-slate-100 hover:text-brand'}`}><NavIcon name="help" /><span className="max-[1400px]:sr-only">Guide</span></ButtonBase>
        {pathname === '/timer' && <Tooltip title={state.sound ? 'Couper les alertes sonores' : 'Activer les alertes sonores'}><IconButton disabled={!ready} aria-label={state.sound ? 'Couper les alertes sonores' : 'Activer les alertes sonores'} aria-pressed={state.sound} className={`size-11 rounded-xl ${state.sound ? 'bg-blue-50 text-brand' : 'text-muted'}`} onClick={() => updateTeam(current => ({ ...current, sound: !current.sound }))}><NavIcon name={state.sound ? 'sound' : 'muted'} /></IconButton></Tooltip>}
        <span role="status" title={cloudDescription} aria-label={cloudDescription} className={`ml-1 flex h-8 items-center gap-1.5 px-2 text-[10px] font-semibold max-[1100px]:sr-only ${cloudTone}`}><span aria-hidden="true" className={`size-1.5 rounded-full bg-current ${loading || cloudStatus === 'saving' ? 'motion-safe:animate-pulse' : ''}`} /><span>{cloudLabel}</span></span>
        {cloudStatus === 'error' && <Tooltip title="Réessayer la connexion Neon"><IconButton onClick={retryCloud} aria-label="Réessayer la sauvegarde Neon" className="size-11 rounded-xl text-danger hover:bg-danger-soft"><NavIcon name="retry" /></IconButton></Tooltip>}
      </div>
    </div>
  </AppBar>;
}