'use client';

import { useEffect } from 'react';
import { animate as motionAnimate } from 'framer-motion';

// Native, delegated feedback covers mouse, touch and keyboard actions without
// wrapping controls, changing focus, or tying animations to countdown renders.
export function useActionMotion() {
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let scroll: { stop: () => void } | undefined;
    const animations = new Map<HTMLElement, { stop: () => void }>();
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
      // Next's hash handling can scroll instantly even when the nested scroller
      // has scroll-behavior:smooth. Keep same-page guide anchors native in spirit.
      if (control instanceof HTMLAnchorElement && control.closest('article[aria-labelledby="help-heading"]') && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
        const href = control.getAttribute('href');
        const destination = href?.startsWith('#') ? document.getElementById(href.slice(1)) : null;
        if (destination) {
          event.preventDefault();
          event.stopPropagation();
          scroll?.stop();
          const scroller = control.closest<HTMLElement>('article[aria-labelledby="help-heading"]')!;
          const top = scroller.scrollTop + destination.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16;
          history.pushState(null, '', href);
          if (preference.matches) scroller.scrollTo({ top, behavior: 'instant' });
          else scroll = motionAnimate(scroller.scrollTop, top, { duration: .5, ease: [.22, 1, .36, 1], onUpdate: value => scroller.scrollTo({ top: value, behavior: 'instant' }) });
        }
      }
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
      observer.observe(main, { subtree: true, attributes: true, attributeFilter: ['open'] });
      // Route containers are replaced only on navigation, not on each timer tick.
      routes.observe(main, { childList: true });
      main.querySelectorAll('[data-route-transition]').forEach(stage => routes.observe(stage, { childList: true }));
      trackLists();
    }
    const stop = () => {
      if (preference.matches) {
        scroll?.stop();
        animations.forEach(animation => animation.stop());
        animations.clear();
      }
    };
    const interruptScroll = () => scroll?.stop();
    const scrollKey = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) interruptScroll();
    };
    document.addEventListener('wheel', interruptScroll, { passive: true });
    document.addEventListener('touchstart', interruptScroll, { passive: true });
    document.addEventListener('keydown', scrollKey);
    window.addEventListener('hashchange', interruptScroll);
    window.addEventListener('popstate', interruptScroll);
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
      document.removeEventListener('wheel', interruptScroll);
      document.removeEventListener('touchstart', interruptScroll);
      document.removeEventListener('keydown', scrollKey);
      window.removeEventListener('hashchange', interruptScroll);
      window.removeEventListener('popstate', interruptScroll);
      preference.removeEventListener('change', stop);
      animations.forEach(animation => animation.stop());
      scroll?.stop();
    };
  }, []);
}