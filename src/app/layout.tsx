import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { TeamProvider } from '@/providers/team-provider';
import { NotificationProvider } from '@/providers/notification-provider';
import { AppShell } from '@/components/layout/app-shell';

export const metadata: Metadata = { title: { default: 'Infomil Mauritius — Point quotidien', template: '%s — Infomil Mauritius' }, description: 'Prenez des nouvelles de votre équipe, partagez votre humeur et donnez la parole à chacun.' };
export const viewport: Viewport = { themeColor: '#205f9d' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="fr" className="h-full w-full overflow-hidden bg-slate-50 font-sans text-ink"><body className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-[radial-gradient(ellipse_at_5%_0%,#e7f0fc_0,transparent_45%),radial-gradient(ellipse_at_100%_15%,#fff3e5_0,transparent_32%)]"><NotificationProvider><TeamProvider><AppShell>{children}</AppShell></TeamProvider></NotificationProvider></body></html>;
}