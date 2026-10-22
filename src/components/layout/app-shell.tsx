'use client';

import { usePathname, useRouter, useSelectedLayoutSegment } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTeam } from '@/providers/team-provider';
import { Navbar } from '@/components/layout/navbar';
import { useActionMotion } from '@/hooks/use-action-motion';
import { motion, MotionConfig, useAnimate, useReducedMotion } from 'framer-motion';
import { Alert, Button } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { PageSkeleton, skeletonVariantForPath } from '@/components/ui/page-skeleton';
import { DailyRound } from './daily-round';
import { DesktopFullscreenGate } from './desktop-fullscreen-gate';
import { WelcomeEntrance } from './welcome-entrance';

export function AppShell({ children }: { children: ReactNode }) {
  useActionMotion();
  const [introOpen, setIntroOpen] = useState(true);
  const closeIntro = useCallback(() => setIntroOpen(false), []);
  const router = useRouter();
  const pathname = usePathname();
  const segment = useSelectedLayoutSegment();
  // Native history updates change pathname before Next loads the new route tree.
  // Never reveal the previous route's children (and its guards) in that gap.
  const routeLoaded = pathname === (segment ? `/${segment}` : '/');
  const publicPage = pathname === '/help' || pathname === '/teams';
  const reduced = useReducedMotion();
  const [routeScope, animateRoute] = useAnimate();
  const { ready, activeTeamId, todayRound, cloudStatus, retryCloud } = useTeam();
  useEffect(() => {
    if (!ready || !routeScope.current || reduced) return;
    const transition = animateRoute(routeScope.current, { opacity: [0, 1], y: [8, 0] }, { duration: .28, ease: [.22, 1, .36, 1] });
    return () => transition.stop();
  }, [pathname, ready, reduced, routeScope, animateRoute]);
  useEffect(() => {
    if (pathname === '/help') return;
    const legacy = { '#participants': '/participants', '#mood': '/mood', '#timer': '/timer' }[location.hash];
    if (legacy) router.replace(legacy);
  }, [pathname, router]);
  // The phone pairs by capability, not by the desktop's Neon/team hydration.
  // It must remain usable even if the unrelated team provider is unavailable.
  if (pathname === '/remote') return <MotionConfig reducedMotion="user"><main id="main-content" className="flex min-h-0 flex-1 flex-col">{children}</main></MotionConfig>;
  return <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 420, damping: 28 }}>
    {introOpen && pathname !== '/spectator' && <WelcomeEntrance onClose={closeIntro} />}
    <div className="contents" inert={introOpen && pathname !== '/spectator'} aria-hidden={introOpen && pathname !== '/spectator' ? true : undefined}>
    {!introOpen && pathname !== '/spectator' && <DesktopFullscreenGate />}
    {pathname !== '/spectator' && <Navbar />}
    <main id="main-content" tabIndex={-1} className="page mx-auto flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden px-6 pt-4.5 pb-2.5 max-[1100px]:px-4 max-[1100px]:pt-3 max-[650px]:gap-2 max-[650px]:px-3 max-[650px]:py-2.5">
      {cloudStatus === 'error' && <Alert severity="warning" className="shrink-0" action={<Button onClick={retryCloud}>Réessayer Neon</Button>}>Données Neon indisponibles ou conflit de sauvegarde. Aucun stockage local. Les modifications non confirmées restent en mémoire. Ne rechargez pas avant de les sauvegarder.</Alert>}
      {ready || publicPage ? <motion.div ref={routeScope} key={activeTeamId} className="flex min-h-0 flex-1 flex-col" data-route-transition>{todayRound && (pathname === '/mood' || pathname === '/timer') ? <DailyRound key={todayRound.id} /> : routeLoaded ? children : cloudStatus === 'error' ? <p role="status" className="text-sm text-muted">Connexion à Neon nécessaire pour ouvrir votre équipe.</p> : <PageSkeleton variant={skeletonVariantForPath(pathname)} />}</motion.div> : cloudStatus === 'error' ? <div className="grid flex-1 place-content-center text-sm text-muted" role="status">Connexion à Neon nécessaire pour ouvrir votre équipe.</div> : <PageSkeleton variant={skeletonVariantForPath(pathname)} label="Chargement de votre équipe depuis Neon…" />}
      <footer className="flex h-5 shrink-0 items-center justify-between text-[9px] text-muted max-[800px]:hidden [@media(max-height:650px)]:hidden"><span><AutoAwesomeIcon className="mr-2 inline-block size-4 text-accent" fontSize="inherit" aria-hidden="true" /> Moins de réunions. Plus de sens.</span><span>Au rythme de votre équipe. <span className="ml-2">Persistance exclusivement dans Neon.</span></span></footer>
    </main>
    </div>
  </MotionConfig>;
}