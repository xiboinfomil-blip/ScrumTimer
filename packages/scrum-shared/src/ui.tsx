'use client';
import { Button } from '@infomil/scrum-shared/ui/button';


import { type ReactNode } from 'react';

export function Loader({ label = 'Chargement…', size = 'md', className = '' }: { label?: string; size?: 'text' | 'sm' | 'md' | 'lg'; className?: string }) {
  const dimensions = { sm: 'w-9', md: 'w-16', lg: 'w-22 [@media(max-height:650px)]:w-16' };
  return <span role="status" aria-live="polite" aria-atomic="true" aria-label={label} data-loader="dial" data-size={size} className={`inline-flex min-w-0 max-w-full shrink-0 flex-col items-center justify-center gap-3 text-center align-middle ${className}`}>
    {size !== 'text' && <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true" focusable="false" className={`block aspect-square h-auto max-w-full shrink-0 ${dimensions[size]}`}>
      <circle cx="48" cy="48" r="40" fill="none" stroke="#e1eaf2" strokeWidth="4" />
      <g className="origin-[48px_48px] motion-safe:animate-[loader-orbit_1.8s_linear_infinite]">
        <circle cx="48" cy="48" r="40" fill="none" stroke="#205f9d" strokeWidth="4" strokeLinecap="round" strokeDasharray="76 176" transform="rotate(-90 48 48)" />
        <circle cx="48" cy="8" r="4" fill="#ec8b23" />
      </g>
      <circle cx="48" cy="48" r="29" fill="#f4f8fc" />
      <path d="M48 23V27M73 48H69M48 73V69M23 48H27" fill="none" stroke="#a7bdcf" strokeWidth="2" strokeLinecap="round" />
      <path d="M48 34V48L57 53" fill="none" stroke="#205f9d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="origin-[48px_48px] motion-safe:animate-[loader-hand_7.2s_linear_infinite]" />
      <circle cx="48" cy="48" r="3" fill="#ec8b23" />
    </svg>}
    <span aria-hidden="true" className="max-w-full text-xs font-medium leading-5 text-slate-600 [overflow-wrap:anywhere]">{label}</span>
  </span>;
}

export const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50';
export const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-brand bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50';
export const field = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900';
export function Panel({ title, children, eyebrow }: { title: string; children: ReactNode; eyebrow?: string }) {
  return <section className="min-w-0 border-t border-slate-200 pt-5"><header className="mb-5">{eyebrow && <p className="mb-1 text-xs font-semibold text-slate-600">{eyebrow}</p>}<h2 className="text-xl font-bold text-slate-900">{title}</h2></header>{children}</section>;
}
export function Pagination({ page, pages, onPage, label }: { page: number; pages: number; onPage: (n: number) => void; label: string }) {
  return <nav aria-label={label} className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4"><Button className={button} disabled={page <= 1} onClick={() => onPage(page - 1)} variant="ghost" type="button">Précédent</Button><span className="text-xs text-slate-600">{page} / {pages}</span><Button className={button} disabled={page >= pages} onClick={() => onPage(page + 1)} variant="ghost" type="button">Suivant</Button></nav>;
}
export function StateScreen({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mx-auto my-12 max-w-xl rounded-lg border border-slate-200 bg-white p-6 sm:p-10"><span aria-hidden="true" className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-2xl font-bold text-brand">i</span><h1 className="mb-3 text-2xl font-bold text-ink">{title}</h1><div className="space-y-4 leading-relaxed text-slate-600">{children}</div></section>;
}