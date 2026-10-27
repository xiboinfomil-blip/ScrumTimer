'use client';

import { useId, type ReactNode } from 'react';

export function Loader({ label = 'Chargement…', size = 'md', className = '' }: { label?: string; size?: 'text' | 'sm' | 'md' | 'lg'; className?: string }) {
  const id = useId();
  const dimensions = { sm: 'w-20', md: 'w-40', lg: 'w-56 [@media(max-height:650px)]:w-40' };
  return <span role="status" aria-live="polite" aria-atomic="true" aria-label={label} data-loader="cradle" data-size={size} className={`inline-flex max-w-full shrink-0 flex-col items-center justify-center gap-1 text-center align-middle ${className}`}>
    {size !== 'text' && <svg viewBox="0 0 176 112" width="176" height="112" aria-hidden="true" focusable="false" className={`block h-auto max-w-full shrink-0 ${dimensions[size]}`}>
      <defs>
        <radialGradient id={`${id}-ball`} cx="32%" cy="25%" r="72%"><stop offset="0" stopColor="#e5e7eb" /><stop offset=".28" stopColor="#777777" /><stop offset="1" stopColor="#323232" /></radialGradient>
        <linearGradient id={`${id}-base`} x2="0" y2="1"><stop stopColor="#121212" /><stop offset="1" stopColor="#282828" /></linearGradient>
        <linearGradient id={`${id}-frame`}><stop stopColor="#444443" /><stop offset="1" stopColor="#777777" /></linearGradient>
      </defs>
      <rect x="24" y="17" width="128" height="78" rx="14" fill="none" stroke={`url(#${id}-frame)`} strokeWidth="2" />
      {[48, 64, 80, 96, 112, 128].map((position, index) => <g key={position} className={index === 0 ? 'origin-[48px_18px] motion-safe:animate-[cradle-left_2s_ease-in-out_infinite] motion-reduce:animate-none' : index === 5 ? 'origin-[128px_18px] motion-safe:animate-[cradle-right_2s_ease-in-out_infinite] motion-reduce:animate-none' : undefined}>
        <path d={`M${position} 18V70`} stroke="#444443" strokeWidth="1" />
        <circle cx={position} cy="78" r="8" fill={`url(#${id}-ball)`} />
      </g>)}
      <rect x="20" y="90" width="136" height="16" rx="4" fill={`url(#${id}-base)`} />
      <path d="M24 96H152" stroke="#444443" strokeWidth="1" />
    </svg>}
    <span aria-hidden="true" className="max-w-full break-words text-xs font-medium leading-5 text-slate-600">{label.replace(/[.…]+$/u, '')}<span className="inline-flex w-4 justify-start"><span className="motion-safe:animate-[cradle-dot_1.2s_ease-in-out_infinite]">.</span><span className="motion-safe:animate-[cradle-dot_1.2s_ease-in-out_infinite] [animation-delay:200ms]">.</span><span className="motion-safe:animate-[cradle-dot_1.2s_ease-in-out_infinite] [animation-delay:400ms]">.</span></span></span>
  </span>;
}

export const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50';
export const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-brand bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50';
export const field = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900';
export function Panel({ title, children, eyebrow }: { title: string; children: ReactNode; eyebrow?: string }) {
  return <section className="min-w-0 border-t border-slate-200 pt-5"><header className="mb-5">{eyebrow && <p className="mb-1 text-xs font-semibold text-slate-600">{eyebrow}</p>}<h2 className="text-xl font-bold text-slate-900">{title}</h2></header>{children}</section>;
}
export function Pagination({ page, pages, onPage, label }: { page: number; pages: number; onPage: (n: number) => void; label: string }) {
  return <nav aria-label={label} className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4"><button className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}>Précédent</button><span className="text-xs text-slate-600">{page} / {pages}</span><button className={button} disabled={page >= pages} onClick={() => onPage(page + 1)}>Suivant</button></nav>;
}
export function StateScreen({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mx-auto my-12 max-w-xl rounded-lg border border-slate-200 bg-white p-6 sm:p-10"><span aria-hidden="true" className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-2xl font-bold text-brand">i</span><h1 className="mb-3 text-2xl font-bold text-ink">{title}</h1><div className="space-y-4 leading-relaxed text-slate-600">{children}</div></section>;
}