export type PageSkeletonVariant = 'teams' | 'list' | 'mood' | 'timer';

const labels: Record<PageSkeletonVariant, string> = {
  teams: 'Chargement des équipes…',
  list: 'Chargement de votre équipe depuis Neon…',
  mood: 'Chargement du baromètre…',
  timer: 'Chargement du minuteur…',
};

export function skeletonVariantForPath(pathname: string): PageSkeletonVariant {
  if (pathname === '/' || pathname === '/teams') return 'teams';
  if (pathname === '/mood') return 'mood';
  if (pathname === '/timer' || pathname === '/spectator') return 'timer';
  return 'list';
}

const surface = 'min-w-0 rounded-2xl border border-line bg-white p-4';

function Block({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-slate-100 ${className}`} />;
}

function Rows({ count = 3 }: { count?: number }) {
  return <div className="flex flex-col gap-2">{Array.from({ length: count }, (_, index) => <div key={index} className="flex min-h-16 items-center gap-3 rounded-xl border border-line p-3">
    <Block className="size-9 shrink-0 rounded-xl bg-blue-50" />
    <div className="min-w-0 flex-1 space-y-2"><Block className="h-3 w-2/3 max-w-48" /><Block className="h-2 w-1/2 max-w-32" /></div>
    <Block className="h-8 w-12 shrink-0" />
  </div>)}</div>;
}

function Prompts() {
  return <div className="flex min-h-0 flex-col gap-2 overflow-hidden">{[0, 1, 2].map(index => <div key={index} className="shrink-0 space-y-2 rounded-xl border border-line bg-slate-50/60 p-2.5">
    <Block className="h-2 w-20 border-l-2 border-accent" /><Block className="h-4 w-5/6" /><Block className="h-3 w-full" /><Block className="h-3 w-2/3" />
  </div>)}</div>;
}

/** Static placeholders only: no timers, shimmer, pulse or interactive imitation. */
export function PageSkeleton({ variant = 'list', scope = 'page', label, className = '' }: {
  variant?: PageSkeletonVariant;
  scope?: 'page' | 'section';
  label?: string;
  className?: string;
}) {
  const section = scope === 'section';
  return <div data-page-skeleton={variant} className={`flex min-h-0 min-w-0 w-full flex-col gap-3 ${section ? '' : 'mx-auto max-w-6xl flex-1 overflow-y-auto pb-2'} ${className}`}>
    <p role="status" aria-live="polite" aria-atomic="true" className="shrink-0 text-[11px] text-muted">{label ?? labels[variant]}</p>
    <div aria-hidden="true" className={`flex min-h-0 flex-col gap-3 ${variant === 'mood' || variant === 'timer' ? 'flex-1' : ''}`}>
      {!section && <div className={`${surface} shrink-0 border-l-4 border-l-accent`}><Block className="h-6 w-3/4 max-w-80" /><Block className="mt-3 h-3 w-5/6 max-w-96" /></div>}
      {variant === 'teams' && <div className={`grid gap-4 ${section ? '' : 'lg:grid-cols-[minmax(0,1fr)_300px]'}`}>
        <div className="min-w-0">{!section && <Block className="mb-3 h-12 w-full rounded-xl" />}<div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map(index => <div key={index} className={surface}><div className="flex gap-3"><Block className="size-11 shrink-0 rounded-xl bg-blue-50" /><div className="min-w-0 flex-1 space-y-2"><Block className="h-4 w-3/4" /><Block className="h-3 w-1/2" /></div></div><div className="mt-4 flex gap-2"><Block className="h-11 flex-1 rounded-xl bg-blue-50" /><Block className="h-11 w-16 rounded-xl" /></div></div>)}</div></div>
        {!section && <div className={`${surface} hidden space-y-4 lg:block`}><Block className="size-10 bg-orange-50" /><Block className="h-5 w-3/4" /><Block className="h-12 w-full" /><Block className="h-11 w-full" /></div>}
      </div>}
      {variant === 'list' && <><Block className="h-13 shrink-0 rounded-xl" /><div className="grid gap-3 min-[801px]:grid-cols-2"><div className={surface}><Rows /></div><div className={`${surface} max-[800px]:hidden`}><Rows /></div></div><Block className="h-11 w-40 self-end rounded-xl bg-blue-50" /></>}
      {variant === 'mood' && <>{!section && <Block className="h-13 shrink-0 rounded-xl min-[801px]:hidden" />}<div className={`grid min-h-0 flex-1 gap-3 ${section ? '' : 'min-[801px]:grid-cols-2'}`}><div className="flex min-h-34 flex-1 flex-col gap-2 rounded-2xl border border-line bg-slate-50 p-2"><div className="grid min-h-34 flex-1 grid-cols-2 grid-rows-2 gap-2">{[0, 1, 2, 3].map(index => <div key={index} className="flex min-h-16 flex-col justify-center gap-2 rounded-xl border border-line bg-white p-3"><Block className="size-6 bg-blue-50" /><Block className="h-3 w-3/4" /></div>)}</div><Block className="h-3 w-2/3 self-center" /></div>{!section && <div className={`${surface} max-[800px]:hidden`}><Rows /></div>}</div></>}
      {variant === 'timer' && (section ? <Prompts /> : <><Block className="h-13 shrink-0 rounded-xl min-[801px]:hidden" /><div className="grid min-h-0 flex-1 gap-3 min-[801px]:grid-cols-[200px_minmax(0,1fr)_190px] min-[1100px]:grid-cols-[240px_minmax(0,1fr)_210px]"><div className={`${surface} max-[800px]:hidden`}><Rows /></div><div className={`${surface} flex min-h-0 flex-col items-center justify-center gap-4`}><Block className="h-5 w-1/2" /><div className="aspect-square w-full max-w-56 rounded-full border-8 border-blue-50 bg-slate-50 [@media(max-height:650px)]:max-w-32" /><Block className="h-11 w-36 shrink-0 rounded-xl bg-blue-50" /></div><div className={`${surface} max-[800px]:hidden`}><Prompts /></div></div></>)}
    </div>
  </div>;
}