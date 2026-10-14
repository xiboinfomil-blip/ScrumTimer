'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { navbarItem } from '@/components/ui/styles';
import { hasValidSession } from '@/lib/team-storage';
import { useTeam } from '@/providers/team-provider';
import { TeamSwitcher } from '@/components/layout/team-switcher';

const steps = [
  { path: '/participants', label: 'Participants', detail: 'Rassembler', icon: 'people' },
  { path: '/mood', label: 'Humeurs', detail: 'Se connecter', icon: 'mood' },
  { path: '/timer', label: 'Minuteur', detail: 'Partager', icon: 'timer' },
] as const;

function NavIcon({ name, className = 'size-4' }: { name: 'people' | 'mood' | 'timer' | 'check' | 'sound' | 'muted'; className?: string }) {
  const paths: Record<typeof name, ReactNode> = {
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    mood: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M8 9h.01M16 9h.01" /></>,
    timer: <><circle cx="12" cy="14" r="8" /><path d="M12 10v4l2 2M9 2h6M12 2v4M18 6l2-2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    sound: <><path d="m11 5-6 4H2v6h3l6 4V5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></>,
    muted: <><path d="m11 5-6 4H2v6h3l6 4V5ZM17 9l5 6M22 9l-5 6" /></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function Navbar() {
  const pathname = usePathname();
  const { state, ready, cloudStatus, retryCloud, updateTeam } = useTeam();
  const currentStep = steps.findIndex(step => step.path === pathname);
  const hasPeople = ready && state.roster.some(person => person.present);
  const canUseTimer = ready && hasValidSession(state);
  const cloudLoading = cloudStatus !== 'error' && (!ready || cloudStatus === 'loading');
  const cloudLabel = cloudLoading ? 'Chargement…'
    : cloudStatus === 'saved' ? 'Neon ✓'
      : cloudStatus === 'saving' ? 'Neon · sauvegarde…' : 'Neon · erreur';
  const cloudDescription = cloudLoading ? 'Chargement de votre équipe depuis Neon…'
    : cloudStatus === 'saved' ? 'Équipe enregistrée dans Neon.'
      : cloudStatus === 'saving' ? 'Enregistrement de l’équipe dans Neon en cours. Les modifications ne sont pas encore confirmées.'
        : 'Échec de l’enregistrement de l’équipe dans Neon. Les modifications ne sont pas confirmées ; réessayez.';

  return <header className="site-header relative z-20 h-17 shrink-0 border-b border-white/80 bg-white/85 shadow-[0_4px_24px_#19375206] backdrop-blur-xl max-[1100px]:h-15 max-[650px]:h-26">
    <a href="#main-content" className="absolute top-2 left-3 z-50 -translate-y-24 rounded-xl bg-brand px-4 py-3 text-xs font-semibold text-white focus:translate-y-0">Aller au contenu</a>
    <div className="mx-auto flex h-full w-full max-w-480 items-center gap-3 px-6 max-[1100px]:gap-2 max-[1100px]:px-4 max-[650px]:flex-wrap max-[650px]:content-center max-[650px]:gap-x-1 max-[650px]:gap-y-1 max-[650px]:px-3 max-[650px]:py-1">
      <Link className="group flex shrink-0 items-center gap-4 rounded-lg max-[650px]:gap-2" href="/participants" aria-label="Accueil du point quotidien Infomil Mauritius">
        <img className="block h-10 w-33 object-contain max-[1100px]:w-25 max-[650px]:h-7.5 max-[650px]:w-16" src="/infomil-logo.svg" alt="Infomil Mauritius" width={190} height={60} />
        <span className="border-l border-line pl-4 max-[1500px]:hidden"><span className="block text-[11px] font-bold tracking-tight text-ink">Le point quotidien<span className="text-accent">.</span></span><span className="mt-0.5 block text-[9px] text-muted">Un moment pour votre équipe</span></span>
      </Link>
      <TeamSwitcher />

      <nav aria-label="Navigation du point quotidien" className="mx-auto min-w-0 max-[650px]:order-3 max-[650px]:w-full">
        <ol aria-label="Progression du point quotidien" className="flex items-center gap-1 rounded-2xl border border-line/70 bg-slate-100/80 p-1 max-[650px]:gap-0.5 max-[650px]:rounded-xl max-[650px]:p-0.5">
          {steps.map((step, index) => {
            const active = index === currentStep;
            const complete = index < currentStep;
            const available = index === 0 || (index === 1 ? hasPeople : canUseTimer);
            const reason = !ready ? 'Chargement de votre équipe…' : index === 1 ? 'Ajoutez au moins une personne présente pour continuer.' : 'Complétez les humeurs et créez le tour de parole pour continuer.';
            const content = <>
              <span className={`grid size-7 shrink-0 place-items-center rounded-lg max-[650px]:size-6 ${active ? 'bg-white/15 text-white' : complete ? 'bg-success-soft text-success' : 'bg-white/80 text-muted'}`}><NavIcon name={complete ? 'check' : step.icon} /></span>
              <span className="min-w-0 text-left"><span className="block text-[11px] font-semibold max-[650px]:text-[10px]">{step.label}</span><span className={`hidden text-[9px] min-[1200px]:block ${active ? 'text-blue-100' : 'text-muted'}`}>{step.detail}</span></span>
              {active && <span className="ml-1 size-1.5 shrink-0 rounded-full bg-accent motion-safe:animate-live-breathe max-[800px]:hidden" aria-hidden="true" />}
            </>;
            const className = `${navbarItem} ${active ? 'bg-linear-to-br from-brand to-brand-dark text-white shadow-[0_3px_10px_#205f9d26,inset_0_1px_0_#ffffff20]' : available ? 'text-muted hover:bg-white hover:text-brand' : 'cursor-not-allowed text-muted opacity-55'}`;
            return <li key={step.path} className="min-w-0 max-[650px]:flex-1" aria-current={active ? 'step' : undefined}>
              {available ? <Link href={step.path} className={className} aria-label={step.label} aria-current={active ? 'page' : undefined}>{content}</Link> : <button type="button" className={className} disabled aria-label={`${step.label} — ${reason}`} title={reason}>{content}</button>}
            </li>;
          })}
        </ol>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Link href="/statistics" aria-label="Statistiques" aria-current={pathname === '/statistics' ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold ${pathname === '/statistics' ? 'bg-blue-50 text-brand' : 'text-muted hover:text-brand'}`}><span aria-hidden="true">▥</span><span className="ml-1 max-[1100px]:sr-only">Statistiques</span></Link>
        {cloudStatus === 'error' && <button type="button" onClick={retryCloud} className="min-h-11 rounded-lg px-1 text-[10px] text-amber-800 underline max-[650px]:hidden" title="Réessayer la sauvegarde Neon">Neon · réessayer</button>}
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted min-[1100px]:rounded-full min-[1100px]:border min-[1100px]:border-line min-[1100px]:bg-white/80 min-[1100px]:px-2.5 min-[1100px]:py-1.5 max-[650px]:text-[9px]" role="status" title={cloudDescription}>
          <span className={`size-1.5 shrink-0 rounded-full ${cloudLoading || cloudStatus === 'saving' ? 'bg-accent motion-safe:animate-live-breathe' : cloudStatus === 'saved' ? 'bg-brand' : 'bg-accent'}`} aria-hidden="true" />
          <span className="max-[1100px]:hidden">{cloudLabel}</span>
          <span className="sr-only">{cloudDescription}</span>
        </span>
        {pathname === '/timer' && <button type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-white text-brand transition-colors hover:border-brand/30 hover:bg-blue-50 disabled:opacity-50 motion-reduce:transition-none" disabled={!ready} aria-label={state.sound ? 'Couper les alertes sonores' : 'Activer les alertes sonores'} aria-pressed={state.sound} title={state.sound ? 'Couper les alertes sonores' : 'Activer les alertes sonores'} onClick={() => updateTeam(current => ({ ...current, sound: !current.sound }))}><NavIcon name={state.sound ? 'sound' : 'muted'} className="size-4" /></button>}
      </div>
    </div>
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-brand/5 via-brand/25 to-accent/35 motion-safe:animate-brand-flow" aria-hidden="true" />
  </header>;
}