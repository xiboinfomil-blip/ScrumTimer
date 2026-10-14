import type { ReactNode } from 'react';

export function WorkflowHeading({ step, title, description, action }: { step: number; title: string; description: ReactNode; action?: ReactNode }) {
  return <section className="flex shrink-0 items-center justify-between gap-3 motion-safe:animate-enter">
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 border-l-2 border-accent pl-2 text-xs font-semibold tabular-nums text-brand" aria-label={`Étape ${step} sur 3`}>{String(step).padStart(2, '0')}<span className="sr-only"> / 3</span></span>
      <div className="min-w-0"><h1 className="text-xl font-semibold tracking-tight text-ink max-[650px]:text-lg" tabIndex={-1}>{title}<span className="text-accent">.</span></h1><div className="text-[11px] leading-snug text-muted max-[650px]:text-[10px]">{description}</div></div>
    </div>{action}
  </section>;
}