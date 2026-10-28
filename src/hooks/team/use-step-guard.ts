'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTeam } from '@/providers/team-provider';
import { hasValidSession } from '@/lib/team/team-storage';

export function useStepGuard(step: 'mood' | 'timer') {
  const { state, ready } = useTeam();
  const router = useRouter();
  const pathname = usePathname();
  const hasPeople = state.roster.some(person => person.present);
  const allowed = ready && hasPeople && (step !== 'timer' || hasValidSession(state));
  useEffect(() => {
    // Native context navigation can precede Next's replacement of old children.
    if (!ready || pathname !== `/${step}` || window.location.pathname !== `/${step}`) return;
    if (!hasPeople) router.replace('/participants');
    else if (step === 'timer' && !hasValidSession(state)) router.replace('/mood');
  }, [ready, hasPeople, state, step, router, pathname]);
  return allowed;
}