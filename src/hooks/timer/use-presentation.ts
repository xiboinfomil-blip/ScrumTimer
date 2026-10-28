'use client';
import { useEffect, useState, type RefObject } from 'react';
export function usePresentation(target: RefObject<HTMLElement | null>) {
  const [presenting, setPresenting] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const change = () => { if (!document.fullscreenElement) setPresenting(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.fullscreenElement && !document.querySelector('[role="dialog"][aria-modal="true"]')) setPresenting(false); };
    document.addEventListener('fullscreenchange', change);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('fullscreenchange', change); document.removeEventListener('keydown', escape); };
  }, []);
  const toggle = async () => {
    if (presenting) { setPresenting(false); return; }
    if (!target.current) return;
    setPresenting(true); setNotice('');
    try { if (document.fullscreenElement) return; if (!document.documentElement.requestFullscreen) throw new Error(); await document.documentElement.requestFullscreen(); }
    catch { setNotice('Plein écran indisponible : présentation dans la fenêtre. Échap pour quitter.'); }
  };
  return { presenting, notice, toggle };
}