import type { Metadata } from 'next';
import { ManageTeamPage } from './_components/manage-team-page';

export const metadata: Metadata = { title: 'Gérer l’équipe' };
export default function Page() { return <ManageTeamPage />; }