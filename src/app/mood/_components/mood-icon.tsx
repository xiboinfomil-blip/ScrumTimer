export function MoodIcon({ name, className = 'size-4' }: { name: 'back' | 'arrow' | 'shuffle' | 'check' | 'clock' | 'meter' | 'lock'; className?: string }) {
  const paths = {
    back: 'M19 12H5m5-5-5 5 5 5',
    arrow: 'M5 12h14m-5-5 5 5-5 5',
    shuffle: 'm18 3 3 3-3 3 M3 18l6-6 M3 6h3l12 12h3 M14 6h7 M18 15l3 3-3 3',
    check: 'm5 12 4 4L19 6',
    clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M12 6v6l4 2',
    meter: 'M4 3h16v16H4V3 M8 7h8 M8 11h3 M8 15h6 M9 19l-2 3 M15 19l2 3',
    lock: 'M5 10h14v11H5V10 M8 10V6a4 4 0 0 1 8 0v4 M12 14v3',
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}