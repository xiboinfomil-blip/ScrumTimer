'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { animate } from 'framer-motion';
import { IconButton } from '@mui/material';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

// Measure actual rendered rows so the meeting stage stays within the viewport.
export function PaginatedList<T extends { id: string; name?: string; present?: boolean; mood?: number | null; postponed?: boolean; done?: boolean }>({ items, renderItem, className = 'checkin-list', ordered = false, activeId }: { items: T[]; renderItem: (item: T, index: number) => ReactNode; className?: string; ordered?: boolean; activeId?: string | null }) {
  const ref = useRef<HTMLUListElement & HTMLOListElement>(null);
  const positions = useRef(new Map<string, number>());
  const [capacity, setCapacity] = useState(100);
  const [page, setPage] = useState(0);
  const direction = useRef(1);
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
  const order = items.map(item => item.id).join('|');
  useLayoutEffect(() => {
    const rows = Array.from(ref.current?.children ?? []) as HTMLElement[];
    const next = new Map<string, number>();
    const animations: ReturnType<typeof animate>[] = [];
    rows.forEach((row, index) => {
      const id = items[current * capacity + index]?.id;
      if (!id) return;
      const top = row.offsetTop;
      const before = positions.current.get(id);
      next.set(id, top);
      if (before !== undefined && before !== top && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animations.push(animate(row, { y: [before - top, 0], opacity: [.65, 1] }, { type: 'spring', stiffness: 250, damping: 25 }));
      }
    });
    positions.current = next;
    return () => animations.forEach(animation => animation.stop());
    // Only ordering and page geometry trigger movement, never countdown updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, current, capacity]);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!ref.current) return;
    const animation = animate(ref.current, { y: [direction.current * 20, 0], opacity: [.35, 1] }, { duration: .3, ease: [.22, 1, .36, 1] });
    return () => animation.stop();
  }, [current]);
  useEffect(() => {
    if (!activeId) return;
    const index = items.findIndex(item => item.id === activeId);
    if (index >= 0) setPage(Math.floor(index / capacity));
    // Only follow speaker changes or resizing, not manual pagination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, capacity]);
  const Tag = ordered ? 'ol' : 'ul';
  const pageButtonSx = { width: 44, height: 44, flexShrink: 0, borderRadius: 2, bgcolor: 'action.hover' };
  return <div className="paginated-list @container relative flex min-h-0 min-w-0 flex-1 gap-1 overflow-hidden">
    <Tag ref={ref} className={`relative mt-2 flex min-h-0 min-w-0 flex-1 list-none flex-col gap-2 overflow-hidden p-1 ${className}`}>{items.slice(current * capacity, (current + 1) * capacity).map((item, index) => renderItem(item, current * capacity + index))}</Tag>
    {pages > 1 && <nav className="list-pagination flex w-11 shrink-0 flex-col items-center justify-center gap-2 text-[10px] text-muted" aria-label="Pages de la liste">
      <IconButton type="button" color="primary" sx={pageButtonSx} aria-label="Page précédente" disabled={current === 0} onClick={() => { direction.current = -1; setPage(current - 1); }}><KeyboardArrowUpIcon aria-hidden="true" sx={{ fontSize: 20 }} /></IconButton>
      <span className="text-center tabular-nums" role="status" aria-live="polite">{current + 1}<span className="block text-[9px]">sur {pages}</span></span>
      <IconButton type="button" color="primary" sx={pageButtonSx} aria-label="Page suivante" disabled={current >= pages - 1} onClick={() => { direction.current = 1; setPage(current + 1); }}><KeyboardArrowDownIcon aria-hidden="true" sx={{ fontSize: 20 }} /></IconButton>
    </nav>}
  </div>;
}