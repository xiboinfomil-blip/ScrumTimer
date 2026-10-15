'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppBar, ButtonBase, IconButton, Step, StepConnector, Stepper, Tooltip } from '@mui/material';
import { motion, useReducedMotion } from 'framer-motion';
import { hasValidSession } from '@/lib/team-storage';
import { useTeam } from '@/providers/team-provider';
import { TeamSwitcher } from './team-switcher';
import { NavIcon, type NavIconName } from './nav-icon';

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
  const cloudTone = cloudStatus === 'error' ? 'bg-danger-soft text-danger' : loading || cloudStatus === 'saving' ? 'bg-amber-50 text-amber-800' : 'bg-success-soft text-success';
  const utilityClass = 'relative flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors motion-reduce:transition-none max-[1100px]:px-2';
  return <AppBar component="header" position="relative" color="transparent" elevation={0} className="site-header z-20 shrink-0 border-b border-line bg-white/95 text-ink backdrop-blur-xl" sx={{ color: 'text.primary' }}>
    <a href="#main-content" className="absolute top-2 left-3 z-50 -translate-y-24 rounded-xl bg-brand px-4 py-3 text-xs font-semibold text-white focus:translate-y-0">Aller au contenu</a>
    <div className="mx-auto flex min-h-18 w-full max-w-480 items-center gap-4 px-6 max-[1100px]:gap-2 max-[1100px]:px-4 max-[800px]:min-h-0 max-[800px]:flex-wrap max-[800px]:gap-y-1 max-[800px]:px-3 max-[800px]:py-1">
      <Link className="flex min-h-11 shrink-0 items-center rounded-lg pr-4 max-[1100px]:pr-1 min-[1101px]:border-r min-[1101px]:border-line" href="/participants" aria-label="Accueil du point quotidien Infomil Mauritius"><img className="h-9 w-28 object-contain max-[1100px]:w-22 max-[800px]:h-7 max-[800px]:w-17 max-[360px]:w-14" src="/infomil-logo.svg" alt="Infomil Mauritius" width={190} height={60} /></Link>
      <TeamSwitcher />
      <nav aria-label="Navigation du point quotidien" className="mx-auto min-w-0 max-w-150 flex-1 rounded-2xl border border-slate-200/70 bg-slate-50 p-1 max-[800px]:order-3 max-[800px]:max-w-none max-[800px]:basis-full">
        <Stepper nonLinear alternativeLabel activeStep={currentStep} aria-label="Progression du point quotidien" connector={<StepConnector sx={{ top: 22, left: -3, right: 'calc(100% - 3px)', '& .MuiStepConnector-line': { borderColor: '#cbd5e1', borderTopWidth: 2 }, '&.Mui-active .MuiStepConnector-line, &.Mui-completed .MuiStepConnector-line': { borderColor: '#147d52' } }} />} sx={{ '& .MuiStep-root': { px: .5, minWidth: 0 } }}>
          {steps.map((step, index) => {
            const active = currentStep === index;
            const complete = Boolean(todayRound) || index < currentStep;
            const available = index === 0 || (index === 1 ? hasPeople : canUseTimer);
            const reason = !ready ? 'Chargement de votre équipe…' : index === 1 ? 'Ajoutez au moins une personne présente pour continuer.' : 'Complétez les humeurs et créez le tour de parole pour continuer.';
            const content = <><motion.span initial={false} animate={{ backgroundColor: active ? '#205f9d' : complete ? '#147d52' : '#e8eef5', color: active || complete ? '#ffffff' : '#65798d' }} transition={{ duration: reduced ? 0 : .2 }} className="grid size-7 shrink-0 place-items-center rounded-lg max-[1000px]:size-6" aria-hidden="true"><NavIcon name={complete && !active ? 'check' : step.icon} className="size-4" /></motion.span><span className="truncate text-xs font-semibold max-[1000px]:text-[11px] max-[360px]:text-[10px]">{step.label}</span>{active && <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-accent" aria-hidden="true" />}</>;
            const itemClass = `relative flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-2 transition-colors max-[1000px]:gap-1.5 max-[360px]:gap-1 max-[360px]:px-0.5 motion-reduce:transition-none ${active ? 'bg-white text-brand shadow-sm ring-1 ring-slate-200/80' : complete ? 'text-success hover:bg-white' : available ? 'text-muted hover:bg-white hover:text-brand' : 'text-slate-400'}`;
            return <Step key={step.path} completed={complete} disabled={!available} aria-current={active ? 'step' : undefined}>{available ? <ButtonBase component={Link} href={step.path} aria-label={step.label} aria-current={active ? 'page' : undefined} className={itemClass}>{content}</ButtonBase> : <ButtonBase disabled aria-label={`${step.label} — ${reason}`} title={reason} className={itemClass}>{content}</ButtonBase>}</Step>;
          })}
        </Stepper>
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {([{ path: '/help', label: 'Guide', accessible: 'Guide d’utilisation', icon: 'help' }, { path: '/statistics', label: 'Statistiques', accessible: 'Statistiques', icon: 'chart' }] as const).map(item => <ButtonBase key={item.path} component={Link} href={item.path} title={item.accessible} aria-label={item.accessible} aria-current={pathname === item.path ? 'page' : undefined} className={`${utilityClass} ${pathname === item.path ? 'bg-blue-50 text-brand ring-1 ring-brand/15' : 'text-muted hover:bg-slate-100 hover:text-brand'}`}><NavIcon name={item.icon as NavIconName} /><span className="max-[1400px]:sr-only">{item.label}</span></ButtonBase>)}
        {pathname === '/timer' && <Tooltip title={state.sound ? 'Couper les alertes sonores' : 'Activer les alertes sonores'}><IconButton disabled={!ready} aria-label={state.sound ? 'Couper les alertes sonores' : 'Activer les alertes sonores'} aria-pressed={state.sound} className={`size-11 rounded-xl ${state.sound ? 'bg-blue-50 text-brand' : 'text-muted'}`} onClick={() => updateTeam(current => ({ ...current, sound: !current.sound }))}><NavIcon name={state.sound ? 'sound' : 'muted'} /></IconButton></Tooltip>}
        <Tooltip title={cloudDescription}><span role="status" title={cloudDescription} aria-label={cloudDescription} className={`ml-1 flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-semibold max-[1100px]:sr-only ${cloudTone}`}><span aria-hidden="true" className={`size-1.5 rounded-full bg-current ${loading || cloudStatus === 'saving' ? 'motion-safe:animate-pulse' : ''}`} /><span>{cloudLabel}</span></span></Tooltip>
        {cloudStatus === 'error' && <Tooltip title="Réessayer la connexion Neon"><IconButton onClick={retryCloud} aria-label="Réessayer la sauvegarde Neon" className="size-11 rounded-xl text-danger hover:bg-danger-soft"><NavIcon name="retry" /></IconButton></Tooltip>}
      </div>
    </div>
  </AppBar>;
}