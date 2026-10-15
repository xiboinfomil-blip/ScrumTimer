import type { Metadata } from 'next';
import { SpectatorPage } from './_components/spectator-page';
export const metadata: Metadata = { title: 'Vue spectateur' };
export default function Page() { return <SpectatorPage />; }