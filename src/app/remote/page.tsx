import type { Metadata } from 'next';
import { TimerRemotePage } from './_components/timer-remote-page';

export const metadata: Metadata = {
  title: 'Télécommande du minuteur',
  description: 'Pilotez votre point quotidien depuis votre téléphone.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function RemotePage() { return <TimerRemotePage />; }