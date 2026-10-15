'use client';

import { useEffect } from 'react';
import { animate as motionAnimate } from 'framer-motion';

// Native, delegated feedback covers mouse, touch and keyboard actions without
// wrapping controls, changing focus, or tying animations to countdown renders.
export function useActionMotion() {
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Map<HTMLElement, { stop: () => void }>();
    const frames = new Set<number>();
    const animate = (element: HTMLElement, keyframes: { opacity?: number[]; transform?: string[]; boxShadow?: string[] }, duration = 380) => {
      if (preference.matches || !element.isConnected || !element.getClientRects().length) return;
      animations.get(element)?.stop();
      const animation = motionAnimate(element, keyframes, { duration: duration / 1000, ease: [.22, 1, .36, 1] });
      animations.set(element, animation);
      const clear = () => { if (animations.get(element) === animation) animations.delete(element); };
      void animation.then(clear);
    };
    const reveal = (element: HTMLElement) => animate(element, { opacity: [.45, 1] }, 320);
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest<HTMLElement>('button, a, summary');
      if (!control || control.matches(':disabled, [aria-disabled="true"], [data-motion-control]') || control.closest('[inert]')) return;
      animate(control, { transform: ['scale(.96)', 'scale(1.015)', 'scale(1)'] });
    };
    const change = (event: Event) => {
      if (!(event.target instanceof HTMLElement)) return;
      const target = event.target;
      if (!target.matches('select, input[type="checkbox"], input[type="radio"], input[type="number"], input[type="range"]')) return;
      const surface = target.closest<HTMLElement>('li') ?? target;
      animate(surface, { boxShadow: ['inset 0 0 0 2px #205f9d45', 'inset 0 0 0 0px #205f9d00'] }, 480);
    };
    const toggle = (event: Event) => {
      if (event.target instanceof HTMLDetailsElement && event.target.open) {
        for (const child of event.target.children) if (child instanceof HTMLElement && child.tagName !== 'SUMMARY') reveal(child);
      }
    };
    const observer = new MutationObserver(records => {
      if (preference.matches) return;
      for (const record of records) {
        const target = record.target;
        if (!(target instanceof HTMLElement)) continue;
        if (record.type === 'childList' && target.matches('ul, ol') && target.closest('#main-content')) {
          // Only structural list changes; never countdown text or live metrics.
          reveal(target);
        } else if (record.attributeName === 'open' && target instanceof HTMLDialogElement && target.open) {
          animate(target, { opacity: [0, 1], transform: ['translateY(18px) scale(.97)', 'translateY(0) scale(1)'] }, 420);
        } else if (record.attributeName === 'aria-pressed' && target.getAttribute('aria-pressed') === 'true' && target.closest('[data-motion-tabs]')) {
          // Run after React has made the selected mobile panel visible.
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            const page = target.closest('#main-content');
            page?.querySelectorAll<HTMLElement>('.workspace > section, #session-leaderboard, #session-statistics, .attendance-section').forEach(reveal);
          });
          frames.add(id);
        }
      }
    });
    // Countdown text changes should not generate global mutation records.
    // Observe structural lists individually and only relevant main attributes.
    const main = document.getElementById('main-content');
    const lists = new MutationObserver(records => {
      if (preference.matches) return;
      for (const record of records) if (record.target instanceof HTMLElement) reveal(record.target);
    });
    const trackLists = () => {
      lists.disconnect();
      main?.querySelectorAll('ul, ol').forEach(list => lists.observe(list, { childList: true }));
    };
    const routes = new MutationObserver(() => {
      trackLists();
      main?.querySelectorAll('[data-route-transition]').forEach(stage => routes.observe(stage, { childList: true }));
    });
    if (main) {
      observer.observe(main, { subtree: true, attributes: true, attributeFilter: ['open', 'aria-pressed'] });
      // Route containers are replaced only on navigation, not on each timer tick.
      routes.observe(main, { childList: true });
      main.querySelectorAll('[data-route-transition]').forEach(stage => routes.observe(stage, { childList: true }));
      trackLists();
    }
    const stop = () => {
      if (preference.matches) {
        animations.forEach(animation => animation.stop());
        animations.clear();
      }
    };
    document.addEventListener('click', click, true);
    document.addEventListener('change', change, true);
    document.addEventListener('toggle', toggle, true);
    preference.addEventListener('change', stop);
    return () => {
      observer.disconnect();
      lists.disconnect();
      routes.disconnect();
      document.removeEventListener('click', click, true);
      document.removeEventListener('change', change, true);
      document.removeEventListener('toggle', toggle, true);
      preference.removeEventListener('change', stop);
      frames.forEach(cancelAnimationFrame);
      animations.forEach(animation => animation.stop());
    };
  }, []);
}