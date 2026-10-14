'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTeam } from '@/providers/team-provider';
import { hasValidSession } from '@/lib/team-storage';

export function useStepGuard(step: 'mood' | 'timer') {
  const { state, ready } = useTeam();
  const router = useRouter();
  const hasPeople = state.roster.some(person => person.present);
  const allowed = ready && hasPeople && (step !== 'timer' || hasValidSession(state));
  useEffect(() => {
    if (!ready) return;
    if (!hasPeople) router.replace('/participants');
    else if (step === 'timer' && !hasValidSession(state)) router.replace('/mood');
  }, [ready, hasPeople, state, step, router]);
  return allowed;
}