import type { Metadata } from 'next';
import { ParticipantsPage } from './_components/participants-page';

export const metadata: Metadata = { title: 'Participants' };
export default function Page() { return <ParticipantsPage />; }