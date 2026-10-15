import type { SVGProps } from 'react';

export type NavIconName = 'people' | 'mood' | 'timer' | 'help' | 'chart' | 'sound' | 'muted' | 'chevron' | 'search' | 'plus' | 'check' | 'cloud' | 'retry';

const paths: Record<NavIconName, string> = {
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  mood: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M8 14s1.5 3 4 3 4-3 4-3 M8 9h.01 M16 9h.01',
  timer: 'M9 2h6 M12 6v2 M19 5l-2 2 M21 14a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 10v5l3 2',
  help: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4 M12 17h.01',
  chart: 'M4 3v17h17 M8 15v-4 M13 15V7 M18 15v-7',
  sound: 'M11 5 6 9H3v6h3l5 4V5 M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14',
  muted: 'M11 5 6 9H3v6h3l5 4V5 M16 9l6 6 M22 9l-6 6',
  chevron: 'm7 10 5 5 5-5',
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  plus: 'M12 5v14 M5 12h14',
  check: 'm5 12 4 4L19 6',
  cloud: 'M7 18a5 5 0 1 1 .6-9.96A7 7 0 0 1 21 11a3.5 3.5 0 0 1-1 7 M9 16l3 3 5-5',
  retry: 'M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-2l2 3 M4 16l2 3a7 7 0 0 0 12-2',
};

export function NavIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: NavIconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}