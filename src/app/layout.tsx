import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { TeamProvider } from '@/providers/team-provider';
import { NotificationProvider } from '@/providers/notification-provider';
import { AppShell } from '@/components/layout/app-shell';
import { DesignProvider } from '@/providers/design-provider';

export const metadata: Metadata = { title: { default: 'Infomil Mauritius — Point quotidien', template: '%s — Infomil Mauritius' }, description: 'Prenez des nouvelles de votre équipe, partagez votre humeur et donnez la parole à chacun.' };
export const viewport: Viewport = { themeColor: '#205f9d' };

export default function RootLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return <html lang="fr" className="h-full w-full overflow-hidden bg-[#f7f8fa] font-sans text-ink"><body className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-linear-to-b from-white to-[#f7f8fa]"><DesignProvider><NotificationProvider><TeamProvider><AppShell modal={modal}>{children}</AppShell></TeamProvider></NotificationProvider></DesignProvider></body></html>;
}