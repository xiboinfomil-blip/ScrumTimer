import type { Metadata } from 'next';
import { MoodPage } from './_components/mood-page';

export const metadata: Metadata = { title: 'Bilan d’humeur' };
export default function Page() { return <MoodPage />; }