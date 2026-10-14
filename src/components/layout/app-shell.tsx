'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useEffect, type ReactNode } from 'react';
import { useTeam } from '@/providers/team-provider';
import { Navbar } from '@/components/layout/navbar';
import { useActionMotion } from '@/hooks/use-action-motion';
import { MotionConfig } from 'framer-motion';

export function AppShell({ children }: { children: ReactNode }) {
  useActionMotion();
  const router = useRouter();
  const { ready, activeTeamId, cloudStatus, retryCloud } = useTeam();
  useEffect(() => {
    const legacy = { '#participants': '/participants', '#mood': '/mood', '#timer': '/timer' }[location.hash];
    if (legacy) router.replace(legacy);
  }, [router]);
  return <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 420, damping: 28 }}>
    <Navbar />
    <main id="main-content" tabIndex={-1} className="page mx-auto flex min-h-0 w-full max-w-480 flex-1 flex-col gap-3 overflow-hidden px-6 pt-4.5 pb-2.5 max-[1100px]:px-4 max-[1100px]:pt-3 max-[650px]:gap-2 max-[650px]:px-3 max-[650px]:py-2.5">
      {cloudStatus === 'error' && <div role="alert" className="shrink-0 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-amber-900">Liste des équipes ou données Neon indisponibles, ou conflit de sauvegarde. Aucun stockage local. Les modifications non confirmées restent en mémoire ; le changement d’équipe est bloqué jusqu’à leur sauvegarde. En cas de conflit, ne rechargez la page que si vous acceptez de les abandonner.<button type="button" className="min-h-11 px-2 font-semibold underline" onClick={retryCloud}>Réessayer Neon</button></div>}
      {ready ? <Fragment key={activeTeamId}>{children}</Fragment> : <div className="grid flex-1 place-content-center justify-items-center gap-3 text-muted" role="status">{cloudStatus !== 'error' && <span className="size-6 rounded-full border-2 border-line border-t-brand motion-safe:animate-spin" aria-hidden="true" />}{cloudStatus === 'error' ? 'Connexion à Neon nécessaire pour ouvrir votre équipe.' : 'Chargement de votre équipe depuis Neon…'}</div>}
      <footer className="flex h-5 shrink-0 items-center justify-between text-[9px] text-muted max-[800px]:hidden [@media(max-height:650px)]:hidden"><span><span className="mr-2 inline-block text-base text-accent motion-safe:animate-speaker-float" aria-hidden="true">✳</span> Moins de réunions. Plus de sens.</span><span>Au rythme de votre équipe. <span className="ml-2">Persistance exclusivement dans Neon.</span></span></footer>
    </main>
  </MotionConfig>;
}