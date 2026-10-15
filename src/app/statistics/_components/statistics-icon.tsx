export function StatisticsIcon({ name, className = 'size-4' }: { name: 'chart' | 'people' | 'clock' | 'check' | 'refresh' | 'calendar'; className?: string }) {
  const paths = {
    chart: 'M4 3v17h17 M8 15v-4 M13 15V7 M18 15v-7',
    people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87',
    clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M12 6v6l4 2',
    check: 'm5 12 4 4L19 6',
    refresh: 'M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-2l2 3 M4 16l2 3a7 7 0 0 0 12-2',
    calendar: 'M3 5h18v16H3V5 M7 3v4 M17 3v4 M3 10h18 M7 14h3 M14 14h3',
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}