'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// Measure actual rendered rows so the meeting stage stays within the viewport.
export function PaginatedList<T extends { id: string }>({ items, renderItem, className = 'checkin-list', ordered = false, activeId }: { items: T[]; renderItem: (item: T, index: number) => ReactNode; className?: string; ordered?: boolean; activeId?: string | null }) {
  const ref = useRef<HTMLUListElement & HTMLOListElement>(null);
  const [capacity, setCapacity] = useState(100);
  const [page, setPage] = useState(0);
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const measure = () => {
      const row = list.querySelector<HTMLElement>('li');
      if (!row) return;
      const css = getComputedStyle(list);
      const gap = parseFloat(css.rowGap) || 0;
      const available = list.clientHeight - (parseFloat(css.paddingTop) || 0) - (parseFloat(css.paddingBottom) || 0);
      setCapacity(Math.max(1, Math.floor((available + gap) / (row.getBoundingClientRect().height + gap))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    const row = list.firstElementChild;
    if (row) observer.observe(row);
    return () => observer.disconnect();
  }, [items.length, page]);
  const pages = Math.max(1, Math.ceil(items.length / capacity));
  const current = Math.min(page, pages - 1);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = ref.current?.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    return () => animation?.cancel();
  }, [current]);
  useEffect(() => {
    if (!activeId) return;
    const index = items.findIndex(item => item.id === activeId);
    if (index >= 0) setPage(Math.floor(index / capacity));
    // Only follow speaker changes or resizing, not manual pagination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, capacity]);
  const Tag = ordered ? 'ol' : 'ul';
  const pageButton = 'grid h-7 w-7.5 place-content-center rounded-lg bg-blue-50 text-brand disabled:cursor-not-allowed disabled:opacity-45';
  return <><Tag ref={ref} className={`mt-2 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-hidden p-1 ${className}`}>{items.slice(current * capacity, (current + 1) * capacity).map((item, index) => renderItem(item, current * capacity + index))}</Tag><nav className={`list-pagination mt-1 flex h-7.5 shrink-0 items-center justify-center gap-3.5 text-[10px] text-muted ${pages === 1 ? 'invisible' : ''}`} aria-label="Pages de la liste"><button className={pageButton} aria-label="Page précédente" disabled={current === 0} onClick={() => setPage(current - 1)}>←</button><span>{current + 1} / {pages}</span><button className={pageButton} aria-label="Page suivante" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>→</button></nav></>;
}