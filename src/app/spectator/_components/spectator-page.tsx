'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from '@mui/material';
import { useTeam } from '@/providers/team-provider';
import { liveRemaining, validateLiveSnapshot, type LiveSnapshot } from '@/lib/live/live-session';
import { usePresentation } from '@/hooks/timer/use-presentation';

export function SpectatorPage() {
  const { activeTeamId, activeTeamName } = useTeam();
  const target = useRef<HTMLElement>(null);
  const presentation = usePresentation(target);
  const [live, setLive] = useState<{ snapshot: LiveSnapshot; offset: number; received: number } | null>(null);
  const [error, setError] = useState('');
  const [localOnly, setLocalOnly] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!activeTeamId) return;
    const controller = new AbortController(); let busy = false;
    async function load() {
      if (busy || document.hidden) return; busy = true;
      const start = Date.now();
      try {
        const response = await fetch('/api/live-session', { headers: { 'X-Team-Id': activeTeamId! }, cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Diffusion indisponible.');
        if (controller.signal.aborted) return;
        const received = Date.now();
        setLive(body.snapshot ? { snapshot: validateLiveSnapshot(body.snapshot), offset: body.serverNow - (start + received) / 2, received } : null);
        setLocalOnly(body.transport === 'instance'); setError('');
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Connexion interrompue.'); }
      finally { busy = false; }
    }
    void load(); const polling = setInterval(() => void load(), 2000);
    const visible = () => { if (!document.hidden) { setNow(Date.now()); void load(); } };
    document.addEventListener('visibilitychange', visible);
    const clock = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000);
    return () => { controller.abort(); clearInterval(polling); clearInterval(clock); document.removeEventListener('visibilitychange', visible); };
  }, [activeTeamId]);
  const stale = live && now - live.received > 6000;
  const snapshot = live && !error && !stale ? live.snapshot : null;
  const remaining = snapshot ? liveRemaining(snapshot, now + live!.offset) : 0;
  const seconds = Math.ceil(Math.abs(remaining));
  return <section ref={target} aria-label="Vue spectateur" className={`${presentation.presenting ? 'fixed inset-0 z-[1400] h-dvh' : 'min-h-0 flex-1'} flex flex-col gap-3 overflow-auto bg-white p-4 text-center sm:p-6`}>
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 text-left"><h1 className="min-w-0 text-xl font-bold wrap-anywhere text-ink">{activeTeamName} · Spectateur</h1><Button variant="outlined" onClick={() => void presentation.toggle()} sx={{ minHeight: 44 }}>{presentation.presenting ? 'Quitter la présentation' : 'Présentation'}</Button></header>
    {presentation.notice && <p role="status" className="text-xs text-muted">{presentation.notice}</p>}
    {localOnly && <Alert severity="info">Diffusion limitée à cette instance. Un service Redis partagé est nécessaire sur un hébergement multi-instance.</Alert>}
    {error && <Alert severity="warning">{error} Reconnexion automatique…</Alert>}
    {stale && !error && <Alert severity="warning">Connexion au direct perdue. Le compte à rebours est masqué jusqu’à la reconnexion.</Alert>}
    <div className="flex min-h-60 flex-1 flex-col items-center justify-center gap-4">
      {!snapshot ? <p role="status" className="text-lg text-muted">{error || stale ? 'Direct indisponible' : 'En attente de la diffusion du facilitateur…'}</p> : <>
        <p role="status" className="font-semibold text-brand">{snapshot.running ? remaining <= 0 ? 'Temps écoulé' : 'À la parole' : 'En pause / prêt'}</p>
        <h2 className="max-w-full break-words text-3xl font-bold text-ink sm:text-5xl">{snapshot.speaker || 'Tour terminé'}</h2>
        <p role="timer" aria-live="off" className={`max-w-full break-all text-5xl font-semibold tabular-nums sm:text-8xl ${remaining <= 0 ? 'text-danger' : 'text-ink'}`}>{remaining < 0 ? '+' : ''}{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</p>
        <p className="text-sm text-muted">{snapshot.completed} / {snapshot.total} passages terminés</p>
        {snapshot.nextSpeaker && <p className="text-lg">Ensuite : <strong>{snapshot.nextSpeaker}</strong></p>}
      </>}
    </div>
  </section>;
}