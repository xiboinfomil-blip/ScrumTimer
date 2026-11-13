'use client';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';


import { useEffect, useRef, useState } from 'react';

import { Button as IconButton } from '@/components/ui/button';
import { MonitorDown as InstallDesktopRounded } from 'lucide-react';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function AppInstallButton() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [pending, setPending] = useState(false);
  const mounted = useRef(false);
  const installed = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const beforeInstall = (event: Event) => {
      if (installed.current || matchMedia('(display-mode: standalone)').matches || (matchMedia('(display-mode: fullscreen)').matches && !document.fullscreenElement) || (navigator as Navigator & { standalone?: boolean }).standalone) return;
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const appInstalled = () => { installed.current = true; setPrompt(null); };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', appInstalled);
    return () => {
      mounted.current = false;
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', appInstalled);
    };
  }, []);
  if (!prompt) return null;
  const install = async () => {
    if (pending) return;
    setPending(true);
    try { await prompt.prompt(); await prompt.userChoice; }
    catch {}
    finally { if (mounted.current) { setPrompt(null); setPending(false); } }
  };
  return <TooltipProvider><Tooltip disableHoverableContent><TooltipTrigger asChild><IconButton aria-label="Installer l’application" disabled={pending} onClick={() => void install()} className="hidden size-11 text-brand min-[801px]:inline-flex" variant="ghost" size="icon"><InstallDesktopRounded /></IconButton></TooltipTrigger><TooltipContent>{"Installer l’application"}</TooltipContent></Tooltip></TooltipProvider>;
}