import type { ReactNode } from 'react';

export function ParticipantIcon({ name, className = 'size-4' }: { name: 'people' | 'plus' | 'reset' | 'trash' | 'arrow' | 'away' | 'check' | 'shield'; className?: string }) {
  const paths: Record<typeof name, ReactNode> = {
    people: <><circle cx="9" cy="7" r="4" /><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M17 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    reset: <><path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7" /><path d="M12 7v5l3 2" /></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    away: <><path d="M9 5H4v14h5M9 12h12m-4-4 4 4-4 4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-5" /></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}