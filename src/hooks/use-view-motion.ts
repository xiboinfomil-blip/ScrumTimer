'use client';

import { useLayoutEffect, useRef } from 'react';
import { animate } from 'framer-motion';

/** Reveal view changes without remounting forms, timers or responsive panels. */
export function useViewMotion(view: string | boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    if (!root || preference.matches) return;
    const animations = Array.from(root.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement && child.getClientRects().length > 0)
      .map(child => animate(child, { opacity: [.4, 1] }, { duration: .24, ease: [.22, 1, .36, 1] }));
    const stop = () => animations.forEach(animation => animation.stop());
    preference.addEventListener('change', stop);
    return () => { stop(); preference.removeEventListener('change', stop); };
  }, [view]);
  return ref;
}