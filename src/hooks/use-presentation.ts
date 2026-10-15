'use client';
import { useEffect, useState, type RefObject } from 'react';
export function usePresentation(target: RefObject<HTMLElement | null>) {
  const [presenting, setPresenting] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const change = () => { if (!document.fullscreenElement) setPresenting(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPresenting(false); };
    document.addEventListener('fullscreenchange', change);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('fullscreenchange', change); document.removeEventListener('keydown', escape); };
  }, []);
  const toggle = async () => {
    if (presenting) { setPresenting(false); if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}); return; }
    setPresenting(true); setNotice('');
    try { if (!target.current?.requestFullscreen) throw new Error(); await target.current.requestFullscreen(); }
    catch { setNotice('Plein écran indisponible : présentation dans la fenêtre. Échap pour quitter.'); }
  };
  return { presenting, notice, toggle };
}