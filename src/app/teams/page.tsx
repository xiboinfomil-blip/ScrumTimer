import type { Metadata } from 'next';
import { TeamsPage } from './_components/teams-page';

export const metadata: Metadata = { title: 'Choisir une équipe' };
export default function Page() { return <TeamsPage />; }