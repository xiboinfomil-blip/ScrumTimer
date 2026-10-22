'use client';

import { useEffect, useRef, useState } from 'react';
import { isCommandAllowed, type RemoteCommand, type RemoteSnapshot, type RemoteTransport } from '@/lib/timer-remote';

interface Pair { id: string; owner: string; control: string; expiresAt: number; transport: RemoteTransport }
type HostSnapshot = Omit<RemoteSnapshot, 'version'>;

export function useTimerRemote(teamId: string | null, snapshot: HostSnapshot, actions: { toggle: () => void; next: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [pair, setPair] = useState<Pair | null>(null);
  const [status, setStatus] = useState('');
  const latest = useRef({ snapshot: { ...snapshot, version: '0' }, actions, signature: '', revision: 0 });
  useEffect(() => {
    // A tick must not invalidate a button; every semantic timer change must.
    const signature = JSON.stringify([snapshot.activeId, snapshot.running, snapshot.deadline, snapshot.completed, snapshot.total, snapshot.blocked, snapshot.speaker, snapshot.nextSpeaker, snapshot.running ? null : snapshot.remaining]);
    if (signature !== latest.current.signature) latest.current.revision++;
    latest.current = { snapshot: { ...snapshot, version: String(latest.current.revision) }, actions, signature, revision: latest.current.revision };
  }, [snapshot, actions]);

  useEffect(() => {
    if (!enabled || !teamId) return;
    let cancelled = false;
    let busy = false;
    let credentials: Pair | null = null;
    let ack: string | undefined;
    const handled = new Set<string>();
    const controller = new AbortController();
    const revoke = (value: Pair) => { void fetch('/api/timer-remote', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${value.owner}` }, body: JSON.stringify({ id: value.id }), keepalive: true }).catch(() => {}); };
    async function sync() {
      if (busy || cancelled || !credentials) return;
      busy = true;
      try {
        const sentAt = performance.now();
        const current = latest.current.snapshot;
        const blocked = current.blocked || document.hidden || Boolean(document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]'));
        const response = await fetch('/api/timer-remote', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.owner}` }, body: JSON.stringify({ operation: 'sync', id: credentials.id, snapshot: { ...current, blocked, running: blocked ? false : current.running }, ...(ack ? { ack } : {}) }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]) });
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) { setStatus('Connexion interrompue. Réactivez la télécommande si nécessaire.'); return; }
        setStatus(credentials.transport === 'shared' ? 'Télécommande prête · connexion sécurisée' : 'Télécommande prête · serveur local uniquement');
        const command = body.command as RemoteCommand | null;
        if (command) {
          ack = command.id;
          const live = latest.current;
          if (!handled.has(command.id) && Math.abs(body.serverNow - command.createdAt) + performance.now() - sentAt <= 5000 && !document.hidden && !document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]') && isCommandAllowed(live.snapshot, command)) {
            handled.add(command.id);
            // Lock this version synchronously: an in-flight duplicate cannot act twice.
            live.snapshot = { ...live.snapshot, blocked: true };
            if (command.action === 'next') live.actions.next(); else live.actions.toggle();
          }
          // Even a locally rejected command consumes its version. A dialog or
          // visibility race must not leave the recovered remote permanently locked.
          live.revision++;
          live.snapshot = { ...live.snapshot, version: String(live.revision) };
        } else if (body.consumedVersion === latest.current.snapshot.version) {
          // An accepted command may expire during a network outage before we
          // receive it. Retire that version without replaying the stale action.
          latest.current.revision++;
          latest.current.snapshot = { ...latest.current.snapshot, version: String(latest.current.revision) };
        }
      } catch { if (!cancelled) setStatus('Connexion interrompue · nouvelle tentative automatique.'); }
      finally { busy = false; }
    }
    async function create() {
      try {
        const response = await fetch('/api/timer-remote', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Team-Id': teamId! }, body: JSON.stringify({ operation: 'create' }), signal: AbortSignal.timeout(8000) });
        const body = await response.json();
        if (!response.ok) {
          if (!cancelled) setStatus(response.status === 409 ? 'Un autre ordinateur contrôle déjà cette équipe. Désactivez-le ou attendez dix secondes après sa déconnexion.' : 'Activation impossible. Vérifiez le secret serveur TIMER_REMOTE_SECRET (32 octets minimum) et le transport partagé, puis réessayez.');
          return;
        }
        credentials = body;
        if (cancelled) { revoke(body); return; }
        setPair(body); void sync();
      } catch { if (!cancelled) setStatus('Impossible de créer le lien. Désactivez puis réessayez.'); }
    }
    const pagehide = () => { if (credentials) revoke(credentials); };
    window.addEventListener('pagehide', pagehide);
    void create();
    const interval = setInterval(() => void sync(), 750);
    return () => { cancelled = true; clearInterval(interval); controller.abort(); window.removeEventListener('pagehide', pagehide); if (credentials) revoke(credentials); };
  }, [enabled, teamId]);

  return { enabled, pair, status, toggle: () => { setPair(null); setStatus('Création du lien sécurisé…'); setEnabled(value => !value); } };
}