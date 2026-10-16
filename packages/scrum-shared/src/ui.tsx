'use client';

import type { ReactNode } from 'react';
export const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50';
export const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50';
export const field = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900';
export function Panel({ title, children, eyebrow }: { title: string; children: ReactNode; eyebrow?: string }) {
  return <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><header className="mb-5">{eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand">{eyebrow}</p>}<h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2></header>{children}</section>;
}
export function Pagination({ page, pages, onPage, label }: { page: number; pages: number; onPage: (n: number) => void; label: string }) {
  return <nav aria-label={label} className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4"><button className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}>Précédent</button><span className="text-xs text-slate-600">{page} / {pages}</span><button className={button} disabled={page >= pages} onClick={() => onPage(page + 1)}>Suivant</button></nav>;
}
export function StateScreen({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mx-auto my-12 max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10"><span aria-hidden="true" className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl font-bold text-brand">i</span><h1 className="mb-3 text-2xl font-bold text-brand">{title}</h1><div className="space-y-4 leading-relaxed text-slate-600">{children}</div></section>;
}