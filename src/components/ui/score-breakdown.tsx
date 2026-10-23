'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { explainScore } from '@/lib/session-results';

export function ScoreBreakdown({ person }: { person: { name: string; speakingSeconds: number; budgetSeconds: number; score: number | null; attempts?: number; manualPenalty?: number } }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button size="small" variant="text" sx={{ minHeight: 44, minWidth: 44, px: 1, fontSize: 10, textTransform: 'none' }} aria-label={`Comprendre le score de ${person.name}`} onClick={() => setOpen(true)}>Détail du score</Button>
    <Dialog open={open} onClose={() => setOpen(false)} aria-labelledby="score-breakdown-title" fullWidth maxWidth="sm">
      <DialogTitle id="score-breakdown-title">Score de {person.name} · {person.score ?? '—'} pts</DialogTitle>
      <DialogContent dividers><ol className="space-y-3 text-sm leading-relaxed">{explainScore(person).map(line => <li key={line}>{line}</li>)}</ol></DialogContent>
      <DialogActions className="flex-wrap"><Button component={Link} href="/help#score" onClick={() => setOpen(false)} sx={{ minHeight: 44 }}>Voir le guide du score</Button><Button onClick={() => setOpen(false)} sx={{ minHeight: 44 }}>Fermer</Button></DialogActions>
    </Dialog>
  </>;
}