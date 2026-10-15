'use client';

import { usePathname } from 'next/navigation';
import { PageSkeleton, skeletonVariantForPath } from '@/components/ui/page-skeleton';
import { useTeam } from '@/providers/team-provider';

export default function Loading() {
  const pathname = usePathname();
  const { cloudStatus } = useTeam();
  // AppShell owns the explicit outage alert and its Neon retry action.
  if (cloudStatus === 'error') return <p role="status" className="text-sm text-muted">Connexion à Neon nécessaire pour ouvrir votre équipe.</p>;
  return <PageSkeleton variant={skeletonVariantForPath(pathname)} />;
}