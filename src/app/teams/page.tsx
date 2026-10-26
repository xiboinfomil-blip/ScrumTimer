import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { TeamsPage } from './_components/teams-page';

export const metadata: Metadata = { title: 'Choisir une équipe' };
export default function Page() { return <Suspense fallback={<PageSkeleton variant="teams" />}><TeamsPage /></Suspense>; }