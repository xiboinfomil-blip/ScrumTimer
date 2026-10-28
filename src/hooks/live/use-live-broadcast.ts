'use client';
import { useEffect, useRef, useState } from 'react';
import type { LiveSnapshot } from '@/lib/live/live-session';

export function useLiveBroadcast(teamId: string | null, snapshot: LiveSnapshot) {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('');
  const latest = useRef(snapshot);
  useEffect(() => { latest.current = snapshot; }, [snapshot]);
  useEffect(() => {
    if (!enabled || !teamId) return;
    let owner: string | null = null; let cancelled = false; let busy = false;
    const controller = new AbortController();
    const headers = { 'Content-Type': 'application/json', 'X-Team-Id': teamId };
    const stop = (token: string) => { void fetch('/api/live-session', { method: 'DELETE', headers, body: JSON.stringify({ owner: token }), keepalive: true }).catch(() => {}); };
    async function send() {
      if (busy || cancelled) return;
      busy = true;
      try {
        const response = await fetch('/api/live-session', { method: 'POST', headers, body: JSON.stringify({ owner, snapshot: latest.current }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) });
        const body = await response.json();
        if (!response.ok) { if (!cancelled) setStatus(body.error ?? 'Diffusion indisponible.'); return; }
        owner = body.owner;
        if (cancelled) { stop(body.owner); return; }
        setStatus(body.transport === 'shared' ? 'En direct · synchronisé' : 'En direct · serveur local uniquement');
      } catch { if (!cancelled) setStatus('Diffusion interrompue · nouvelle tentative automatique.'); }
      finally { busy = false; }
    }
    const unload = () => { if (owner) stop(owner); };
    window.addEventListener('pagehide', unload);
    void send();
    const interval = setInterval(() => void send(), 2000);
    return () => { cancelled = true; clearInterval(interval); controller.abort(); window.removeEventListener('pagehide', unload); if (owner) stop(owner); };
  }, [enabled, teamId]);
  return { enabled, status, toggle: () => { setStatus('Connexion à la diffusion…'); setEnabled(value => !value); } };
}