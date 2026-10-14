import type { Metadata } from 'next';
import { TimerPage } from './_components/timer-page';

export const metadata: Metadata = { title: 'Minuteur du point quotidien' };

export default function Page() {
  return <TimerPage />;
}