import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MoodPage } from './_components/mood-page';

export const metadata: Metadata = { title: 'Bilan d’humeur' };
export default function Page() { return <Suspense><MoodPage /></Suspense>; }