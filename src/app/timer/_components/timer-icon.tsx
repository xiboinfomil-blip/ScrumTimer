export function TimerIcon({ name, className = 'size-4' }: { name: 'play' | 'pause' | 'next' | 'reset' | 'later' | 'edit' | 'lock' | 'shuffle' | 'back' | 'timer'; className?: string }) {
  const paths = {
    timer: 'M9 2h6 M12 2v3 M18 5l2 2 M12 10v5l3 2 M20 14a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    play: 'm8 4 12 8-12 8V4',
    pause: 'M8 4v16 M16 4v16',
    next: 'M4 12h15m-6-6 6 6-6 6',
    reset: 'M3 10a9 9 0 1 1 2 8 M3 3v7h7',
    later: 'M4 12a8 8 0 0 1 14-5l3 3 M21 4v6h-6 M12 12v5l3 2',
    edit: 'm16 3 5 5L8 21H3v-5L16 3 M13 6l5 5',
    lock: 'M5 10h14v11H5V10 M8 10V6a4 4 0 0 1 8 0v4 M12 14v3',
    shuffle: 'm18 3 3 3-3 3 M3 18l6-6 M3 6h3l12 12h3 M14 6h7 M18 15l3 3-3 3',
    back: 'M19 12H5m5-5-5 5 5 5',
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}