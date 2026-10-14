// Shared Tailwind recipes. Full class names keep automatic source detection reliable.
export const card = 'rounded-xl border border-line bg-white shadow-none motion-safe:animate-page-reveal motion-safe:transition-colors motion-safe:duration-300 hover:border-brand/20';
export const eyebrow = 'text-[10px] font-bold tracking-[1.7px] leading-relaxed text-slate-500 max-[650px]:text-[8px] max-[650px]:tracking-wide';
export const primaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none';
export const secondaryButton = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-white px-2.5 py-2 text-xs font-medium text-brand transition hover:border-brand/25 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none';
export const dangerButton = 'min-h-8 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45';
export const iconButton = 'grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-white text-xl text-brand transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-45';
export const textButton = 'whitespace-nowrap bg-transparent px-1 py-1.5 text-[11px] font-semibold text-brand hover:text-accent disabled:cursor-not-allowed disabled:opacity-45';
export const countPill = 'inline-grid h-6 min-w-6 place-items-center rounded-lg bg-blue-50 px-1.5 text-[11px] text-brand motion-safe:animate-page-reveal';
export const routeStage = 'flex min-h-0 flex-1 flex-col gap-2 motion-safe:animate-page-reveal';
export const field = 'min-w-0 rounded-xl border border-line bg-slate-50 px-3 py-2 text-xs focus:border-blue-300 focus:bg-white';
export const checkbox = 'size-4 shrink-0 cursor-pointer accent-brand';
export const navbarItem = 'flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-1.5 transition-colors duration-200 motion-reduce:transition-none max-[800px]:gap-1.5 max-[800px]:px-2 max-[650px]:gap-1 max-[650px]:rounded-lg max-[650px]:px-1';
export const presentBadge = 'inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-1 text-[11px] font-semibold text-success';
export const absentBadge = 'inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-1 text-[11px] font-semibold text-danger';
export const segmentedTabs = 'hidden h-11 shrink-0 gap-1 rounded-xl bg-slate-100/90 max-[800px]:flex [&>button]:min-w-0 [&>button]:flex-1 [&>button]:rounded-xl [&>button]:border [&>button]:border-transparent [&>button]:px-2 [&>button]:text-xs [&>button]:font-medium [&>button]:text-muted [&>button[aria-pressed=true]]:border-line [&>button[aria-pressed=true]]:bg-white [&>button[aria-pressed=true]]:text-brand [&>button[aria-pressed=true]]:shadow-sm';