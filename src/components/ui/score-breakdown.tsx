'use client';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';


import { useState } from 'react';
import Link from 'next/link';

import { Button, Button as IconButton } from '@/components/ui/button';
import { Info as InfoOutlined } from 'lucide-react';
import { explainScore } from '@/lib/history/session-results';

export function ScoreBreakdown({ person, compact = false }: { person: { name: string; speakingSeconds: number; budgetSeconds: number; score: number | null; attempts?: number; manualPenalty?: number }; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    {compact ? <TooltipProvider><Tooltip disableHoverableContent><TooltipTrigger asChild><IconButton aria-label={`Comprendre le score de ${person.name}`} onClick={() => setOpen(true)} className="size-11! text-brand!" variant="ghost" size="icon"><InfoOutlined size={20} /></IconButton></TooltipTrigger><TooltipContent>{`Détail du score de ${person.name}`}</TooltipContent></Tooltip></TooltipProvider> : <Button aria-label={`Comprendre le score de ${person.name}`} onClick={() => setOpen(true)} variant="ghost" size="sm" className="min-h-[44px] min-w-[44px] px-[8px] text-[10px] normal-case">Détail du score</Button>}
    <Dialog open={open} onOpenChange={next => { if (!next) (() => setOpen(false))?.(); }}><DialogContent showCloseButton={false} className="min-h-0 max-w-[600px]" aria-labelledby="score-breakdown-title">
      <DialogTitle id="score-breakdown-title" className="shrink-0 px-5 pt-5 pb-2">Score de {person.name} · {person.score ?? '—'} pts</DialogTitle>
      <div className="min-h-0 overflow-y-auto px-5 py-3 border-y border-line"><ol className="space-y-3 text-sm leading-relaxed">{explainScore(person).map(line => <li key={line}>{line}</li>)}</ol></div>
      <DialogFooter className="flex-wrap"><Button onClick={() => setOpen(false)} variant="ghost" asChild className="min-h-[44px]"><Link href="/help#score">Voir le guide du score</Link></Button><Button onClick={() => setOpen(false)} variant="ghost" className="min-h-[44px]">Fermer</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}