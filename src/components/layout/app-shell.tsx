'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useTeam } from '@/providers/team-provider';
import { Navbar } from '@/components/layout/navbar';

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { ready, persistent } = useTeam();
  useEffect(() => {
    const legacy = { '#participants': '/participants', '#mood': '/mood', '#timer': '/timer' }[location.hash];
    if (legacy) router.replace(legacy);
  }, [router]);
  return <>
    <Navbar />
    <main id="main-content" tabIndex={-1} className="page mx-auto flex min-h-0 w-full max-w-480 flex-1 flex-col gap-3 overflow-hidden px-6 pt-4.5 pb-2.5 max-[1100px]:px-4 max-[1100px]:pt-3 max-[650px]:gap-2 max-[650px]:px-3 max-[650px]:py-2.5">
      {!persistent && <p className="storage-notice shrink-0 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-[10px] leading-snug text-amber-800">Le stockage du navigateur est indisponible. Votre équipe reste utilisable pendant cette visite, mais risque d’être perdue au rechargement.</p>}
      {ready ? children : <div className="grid flex-1 place-content-center text-muted" role="status">Chargement de votre équipe…</div>}
      <footer className="flex h-5 shrink-0 items-center justify-between text-[9px] text-muted max-[800px]:hidden [@media(max-height:650px)]:hidden"><span><span className="mr-2 text-base text-accent" aria-hidden="true">✳</span> Moins de réunions. Plus de sens.</span><span>Au rythme de votre équipe. <span className="ml-2">Enregistré uniquement sur cet appareil.</span></span></footer>
    </main>
  </>;
}