'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { animate } from 'framer-motion';

// Measure actual rendered rows so the meeting stage stays within the viewport.
export function PaginatedList<T extends { id: string; name?: string; present?: boolean; mood?: number | null; postponed?: boolean; done?: boolean }>({ items, renderItem, className = 'checkin-list', ordered = false, activeId }: { items: T[]; renderItem: (item: T, index: number) => ReactNode; className?: string; ordered?: boolean; activeId?: string | null }) {
  const ref = useRef<HTMLUListElement & HTMLOListElement>(null);
  const overview = useRef<HTMLDialogElement>(null);
  const overviewId = useId();
  const positions = useRef(new Map<string, number>());
  const [chosen, setChosen] = useState('');
  const [overviewOpen, setOverviewOpen] = useState(false);
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
    const animation = animate(ref.current, { opacity: [.35, 1] }, { duration: .3, ease: [.22, 1, .36, 1] });
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
  const pageButton = 'grid h-7 w-7.5 place-content-center rounded-lg bg-blue-50 text-brand disabled:cursor-not-allowed disabled:opacity-45';
  return <><Tag ref={ref} className={`relative mt-2 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-hidden p-1 ${className}`}>{items.slice(current * capacity, (current + 1) * capacity).map((item, index) => renderItem(item, current * capacity + index))}</Tag><nav className={`list-pagination mt-1 flex h-7.5 shrink-0 items-center justify-center gap-2 text-[10px] text-muted ${pages === 1 ? 'invisible' : ''}`} aria-label="Pages de la liste"><button className={pageButton} aria-label="Page précédente" disabled={current === 0} onClick={() => setPage(current - 1)}>←</button><span>{current + 1} / {pages}</span><button className={pageButton} aria-label="Page suivante" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>→</button><button type="button" className="min-h-11 rounded-lg px-2 text-[10px] font-semibold text-brand hover:bg-blue-50" onClick={() => { setChosen(items[0]?.id ?? ''); setOverviewOpen(true); overview.current?.showModal(); }}>Vue d’ensemble · {items.length}</button></nav>
    <dialog ref={overview} onClose={() => setOverviewOpen(false)} aria-label="Vue d’ensemble des personnes" className="m-auto w-[calc(100%-24px)] max-w-4xl overflow-hidden rounded-xl border border-line bg-white p-3 text-ink shadow-xl backdrop:bg-ink/40">
      {overviewOpen && <>
      <div className="flex h-11 items-center justify-between gap-2"><h2 className="text-sm font-semibold">Toute la liste · {items.length}</h2><button type="button" className="grid size-11 place-items-center rounded-lg hover:bg-blue-50" aria-label="Fermer la vue d’ensemble" onClick={() => overview.current?.close()}>✕</button></div>
      <p className="mb-2 text-[10px] text-muted">✓ terminé · ◷ en attente · 1–4 humeur · − absent</p>
      <ul className="grid list-none grid-cols-4 gap-x-1 gap-y-0.5 sm:grid-cols-6 lg:grid-cols-8" aria-label="Toutes les personnes">
        {items.map((item, index) => <li key={item.id} className={`min-w-0 truncate rounded px-1 text-[10px] leading-3 ${item.id === activeId ? 'bg-brand text-white' : item.postponed ? 'bg-orange-50 text-amber-800' : item.done || item.mood ? 'bg-success-soft text-success' : item.present === false ? 'bg-danger-soft text-danger' : 'bg-slate-50 text-ink'}`} title={item.name ?? item.id}><span aria-hidden="true">{item.done ? '✓' : item.postponed ? '◷' : item.present === false ? '−' : item.mood ?? index + 1} </span>{item.name ?? item.id}<span className="sr-only">{item.done ? ', terminé' : item.postponed ? ', en attente' : item.present === false ? ', absent' : ''}</span></li>)}
      </ul>
      <div className="mt-2 flex gap-2"><label className="sr-only" htmlFor={overviewId}>Aller à une personne</label><select id={overviewId} className="h-11 min-w-0 flex-1 rounded-lg border border-line px-2 text-xs" value={chosen} onChange={event => setChosen(event.target.value)}>{items.map(item => <option key={item.id} value={item.id}>{item.name ?? item.id}</option>)}</select><button type="button" className="min-h-11 rounded-lg bg-brand px-3 text-xs font-semibold text-white" onClick={() => { const index = items.findIndex(item => item.id === chosen); if (index >= 0) setPage(Math.floor(index / capacity)); overview.current?.close(); }}>Voir</button></div>
      </>}
    </dialog>
  </>;
}