'use client';

import { useEffect } from 'react';

export function DesktopFullscreenGate() {
  useEffect(() => {
    if (document.fullscreenElement || !document.fullscreenEnabled || !document.documentElement.requestFullscreen || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) return;
    let active = true;
    const cleanup = () => {
      document.removeEventListener('pointerup', interact);
      document.removeEventListener('keydown', interact);
      document.removeEventListener('fullscreenchange', changed);
    };
    const enter = () => {
      if (!active || document.fullscreenElement) return;
      void document.documentElement.requestFullscreen().catch(() => {});
    };
    const interact = (event: Event) => {
      if (!event.isTrusted || event instanceof KeyboardEvent && (event.key === 'Escape' || event.ctrlKey || event.altKey || event.metaKey)) return;
      cleanup();
      enter();
    };
    const changed = () => { if (document.fullscreenElement) cleanup(); };
    document.addEventListener('pointerup', interact);
    document.addEventListener('keydown', interact);
    document.addEventListener('fullscreenchange', changed);
    enter();
    return () => { active = false; cleanup(); };
  }, []);
  return null;
}