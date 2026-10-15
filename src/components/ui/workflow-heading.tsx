'use client';
import type { ReactNode } from 'react';
import { Avatar, Typography } from '@mui/material';
export function WorkflowHeading({ step, title, description, action }: { step: number; title: string; description: ReactNode; action?: ReactNode }) {
  return <section className="flex shrink-0 items-center justify-between gap-3 motion-safe:animate-enter"><div className="flex min-w-0 items-center gap-3"><Avatar variant="rounded" aria-label={`Étape ${step} sur 3`} sx={{ width: 38, height: 38, fontSize: 13, fontWeight: 750, bgcolor: '#eaf2fc', color: 'primary.main', border: '1px solid #dce8f6', borderRadius: 3 }}>{String(step).padStart(2, '0')}</Avatar><div className="min-w-0"><Typography component="h1" variant="h5" tabIndex={-1} sx={{ fontSize: { xs: 19, sm: 23 }, lineHeight: 1.3 }}>{title}<span className="text-accent">.</span></Typography><div className="mt-0.5 text-[11px] leading-snug text-muted max-[650px]:text-[10px]">{description}</div></div></div>{action}</section>;
}