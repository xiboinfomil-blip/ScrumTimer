'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppBar, Button, ButtonBase, Chip, IconButton, Step, StepConnector, StepLabel, Stepper, Tooltip } from '@mui/material';
import { motion, useReducedMotion } from 'framer-motion';
import { hasValidSession } from '@/lib/team-storage';
import { useTeam } from '@/providers/team-provider';
import { TeamSwitcher } from './team-switcher';

const steps = [
  { path: '/participants', label: 'Participants', detail: 'Rassembler l’équipe' },
  { path: '/mood', label: 'Humeurs', detail: 'Prendre des nouvelles' },
  { path: '/timer', label: 'Minuteur', detail: 'Donner la parole' },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const { state, ready, todayRound, cloudStatus, retryCloud, updateTeam } = useTeam();
  const currentStep = steps.findIndex(step => step.path === pathname);
  const hasPeople = ready && (Boolean(todayRound) || state.roster.some(person => person.present));
  const canUseTimer = ready && (Boolean(todayRound) || hasValidSession(state));
  const loading = cloudStatus !== 'error' && (!ready || cloudStatus === 'loading');
  const cloudLabel = loading ? 'Chargement…' : cloudStatus === 'saved' ? 'Neon ✓' : cloudStatus === 'saving' ? 'Neon · sauvegarde…' : 'Neon · erreur';
  const cloudDescription = cloudStatus === 'saved' ? 'Équipe enregistrée dans Neon.' : loading ? 'Chargement de votre équipe depuis Neon…' : cloudStatus === 'saving' ? 'Enregistrement de l’équipe dans Neon en cours.' : 'Échec de l’enregistrement de l’équipe dans Neon. Réessayez.';
  return <AppBar component="header" position="relative" color="transparent" elevation={0} className="site-header z-20 shrink-0" sx={{ backgroundColor: '#ffffffee', backdropFilter: 'blur(20px)', borderBottom: '1px solid', borderColor: 'divider', color: 'text.primary' }}>
    <a href="#main-content" className="absolute top-2 left-3 z-50 -translate-y-24 rounded-xl bg-brand px-4 py-3 text-xs font-semibold text-white focus:translate-y-0">Aller au contenu</a>
    <div className="mx-auto flex h-17 w-full max-w-480 items-center gap-3 px-6 max-[1100px]:gap-2 max-[1100px]:px-4 max-[800px]:h-auto max-[800px]:flex-wrap max-[800px]:gap-y-0 max-[800px]:px-3 max-[800px]:pt-1">
      <Link className="flex shrink-0 items-center rounded-lg" href="/participants" aria-label="Accueil du point quotidien Infomil Mauritius"><img className="h-9 w-28 object-contain max-[1100px]:w-22 max-[800px]:h-7 max-[800px]:w-17" src="/infomil-logo.svg" alt="Infomil Mauritius" width={190} height={60} /></Link>
      <TeamSwitcher />
      <nav aria-label="Navigation du point quotidien" className="mx-auto min-w-0 flex-1 max-w-160 max-[800px]:order-3 max-[800px]:max-w-none max-[800px]:basis-full">
        <Stepper nonLinear alternativeLabel activeStep={currentStep} aria-label="Progression du point quotidien" connector={<StepConnector sx={{ top: 16, left: 'calc(-50% + 22px)', right: 'calc(50% + 22px)', '& .MuiStepConnector-line': { borderTopWidth: 2, borderColor: '#e0e8f2', transition: 'border-color 350ms' }, '&.Mui-active .MuiStepConnector-line, &.Mui-completed .MuiStepConnector-line': { borderColor: 'success.main' } }} />} sx={{ py: .6, '& .MuiStep-root': { px: .5 }, '& .MuiStepLabel-labelContainer': { display: 'none' }, '& .MuiStepButton-root': { m: 0, p: 0, borderRadius: 2, minHeight: 54, width: '100%' } }}>
          {steps.map((step, index) => {
            const active = currentStep === index;
            const complete = Boolean(todayRound) || index < currentStep;
            const available = index === 0 || (index === 1 ? hasPeople : canUseTimer);
            const reason = !ready ? 'Chargement de votre équipe…' : index === 1 ? 'Ajoutez au moins une personne présente pour continuer.' : 'Complétez les humeurs et créez le tour de parole pour continuer.';
            const content = <StepLabel icon={<span className="flex flex-col items-center gap-1"><motion.span initial={false} animate={{ backgroundColor: active ? '#205f9d' : complete ? '#147d52' : '#edf2f8', color: active || complete ? '#ffffff' : '#8293a6', scale: active ? 1.06 : 1 }} transition={{ duration: reduced ? 0 : .25 }} className="grid size-8 place-items-center rounded-full border-4 border-white text-[11px] font-bold shadow-sm" aria-hidden="true">{complete && !active ? '✓' : `0${index + 1}`}</motion.span><span className={`text-[11px] font-semibold max-[400px]:text-[10px] ${active ? 'text-brand' : complete ? 'text-success' : 'text-muted'}`}>{step.label}</span><span className="hidden text-[9px] text-muted min-[1400px]:block">{step.detail}</span></span>} />;
            return <Step key={step.path} completed={complete} disabled={!available} aria-current={active ? 'step' : undefined}>{available ? <ButtonBase component={Link} href={step.path} aria-label={step.label} aria-current={active ? 'page' : undefined} sx={{ minHeight: 54, width: '100%', borderRadius: 2 }}>{content}</ButtonBase> : <ButtonBase disabled aria-label={`${step.label} — ${reason}`} title={reason} sx={{ minHeight: 54, width: '100%', borderRadius: 2, opacity: .55 }}>{content}</ButtonBase>}</Step>;
          })}
        </Stepper>
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button component={Link} href="/help" aria-label="Guide d’utilisation" aria-current={pathname === '/help' ? 'page' : undefined} variant={pathname === '/help' ? 'contained' : 'text'} sx={{ minWidth: 44, minHeight: 44, px: 1 }}><span aria-hidden="true" className="text-lg">?</span><span className="ml-1 max-[1200px]:sr-only">Guide</span></Button>
        <Button component={Link} href="/statistics" aria-label="Statistiques" aria-current={pathname === '/statistics' ? 'page' : undefined} variant={pathname === '/statistics' ? 'contained' : 'text'} sx={{ minWidth: 44, px: 1 }}><span aria-hidden="true" className="text-lg">▥</span><span className="ml-1 max-[1200px]:sr-only">Statistiques</span></Button>
        <Tooltip title={cloudDescription}><Chip component="span" role="status" title={cloudDescription} label={cloudLabel} size="small" color={cloudStatus === 'error' ? 'error' : 'success'} variant="outlined" sx={{ display: { xs: 'none', lg: 'inline-flex' }, border: 0, backgroundColor: cloudStatus === 'error' ? '#fff1f0' : '#edf9f2' }} /></Tooltip>
        <span className="sr-only">{cloudDescription}</span>
        {cloudStatus === 'error' && <Button onClick={retryCloud} sx={{ minWidth: 44, fontSize: 10 }} aria-label="Réessayer la sauvegarde Neon">Réessayer</Button>}
        {pathname === '/timer' && <Tooltip title={state.sound ? 'Couper les alertes sonores' : 'Activer les alertes sonores'}><IconButton disabled={!ready} color="primary" aria-label={state.sound ? 'Couper les alertes sonores' : 'Activer les alertes sonores'} aria-pressed={state.sound} onClick={() => updateTeam(current => ({ ...current, sound: !current.sound }))}><span aria-hidden="true">{state.sound ? '♪' : '♩'}</span></IconButton></Tooltip>}
      </div>
    </div>
  </AppBar>;
}