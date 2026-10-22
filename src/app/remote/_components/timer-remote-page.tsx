'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import SkipNextRounded from '@mui/icons-material/SkipNextRounded';
import SmartphoneRounded from '@mui/icons-material/SmartphoneRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import { isRemoteToken, type RemoteSnapshot, type RemoteStatus, type RemoteTransport } from '@/lib/timer-remote';

interface Connection { snapshot: RemoteSnapshot | null; status: RemoteStatus; serverNow: number; transport: RemoteTransport; receivedAt: number; receivedMono: number }
interface Credentials { id: string; token: string }

export function TimerRemotePage() {
  const credentials = useRef<Credentials | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [message, setMessage] = useState('Connexion au minuteur…');
  const [invalid, setInvalid] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [now, setNow] = useState(0);
  const [confirmNext, setConfirmNext] = useState<string | null>(null);
  const mounted = useRef(false);
  const refresh = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    mounted.current = true;
    // Fragment capabilities are never included in HTTP URLs or referrers.
    const [id, token, extra] = location.hash.slice(1).split('.');
    if (!isRemoteToken(id) || !isRemoteToken(token) || extra !== undefined) {
      setInvalid(true); setMessage('Ce lien est incomplet. Scannez le QR code affiché sur le minuteur.');
      return () => { mounted.current = false; };
    }
    credentials.current = { id, token };
    let stopped = false;
    let busy = false;
    const controller = new AbortController();
    async function read() {
      if (busy || stopped || document.hidden) return;
      busy = true;
      try {
        const response = await fetch(`/api/timer-remote?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]) });
        const body = await response.json();
        if (stopped) return;
        if (response.status === 401 || response.status === 404) {
          stopped = true; setInvalid(true); setConnection(null); setMessage('Ce lien a expiré ou a été désactivé. Scannez un nouveau QR code.'); return;
        }
        if (!response.ok) throw new Error();
        setConnection({ ...body, receivedAt: Date.now(), receivedMono: performance.now() });
        setMessage(body.status === 'online' ? '' : 'Gardez le minuteur ouvert et visible sur l’ordinateur.');
        setNow(performance.now());
      } catch { if (!stopped) { setConnection(null); setMessage('Connexion interrompue. Reconnexion automatique…'); } }
      finally { busy = false; }
    }
    refresh.current = read;
    const visible = () => { if (!document.hidden) void read(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    void read();
    const poll = setInterval(() => void read(), 1000);
    const clock = setInterval(() => { if (!document.hidden) setNow(performance.now()); }, 250);
    return () => { mounted.current = false; stopped = true; controller.abort(); clearInterval(poll); clearInterval(clock); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', visible); };
  }, []);

  const snapshot = connection?.snapshot;
  const fresh = Boolean(connection && connection.status === 'online' && now - connection.receivedMono < 3500);
  const usable = fresh && Boolean(snapshot?.activeId) && !snapshot?.blocked && !pending && !invalid;
  const remaining = snapshot ? snapshot.running && fresh ? (snapshot.deadline - connection!.serverNow - (now - connection!.receivedMono)) / 1000 : snapshot.remaining : 0;
  const seconds = Math.ceil(Math.abs(remaining));
  const time = `${remaining < 0 ? '+' : ''}${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  const finished = Boolean(snapshot && snapshot.completed === snapshot.total && snapshot.total > 0);
  const stateLabel = invalid ? 'Lien indisponible' : !fresh ? 'En attente de connexion' : finished ? 'Point terminé' : snapshot?.blocked ? 'Action sur l’ordinateur' : snapshot?.running ? remaining < 0 ? 'Temps écoulé · concluez' : 'Le passage est en cours' : 'Prêt à votre rythme';

  async function command(action: 'start' | 'pause' | 'next') {
    if (!usable || !snapshot || !credentials.current || pendingRef.current) return;
    pendingRef.current = true; setPending(true); setConfirmNext(null);
    try {
      // getRandomValues also works on an HTTP LAN preview, unlike randomUUID.
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      const requestId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      const response = await fetch('/api/timer-remote', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.current.token}` }, body: JSON.stringify({ operation: 'command', id: credentials.current.id, command: { requestId, action, version: snapshot.version } }), signal: AbortSignal.timeout(5000) });
      if (!mounted.current) return;
      setMessage(response.ok ? 'Commande envoyée · en attente du minuteur.' : response.status === 409 ? 'Le minuteur a changé. Réessayez après synchronisation.' : 'Commande non envoyée. Vérifiez la connexion.');
      await refresh.current();
    } catch { if (mounted.current) setMessage('Envoi non confirmé. Vérifiez le minuteur avant de réessayer.'); }
    finally { pendingRef.current = false; if (mounted.current) setPending(false); }
  }

  return <div className="flex min-h-0 flex-1 justify-center overflow-y-auto overscroll-contain bg-[radial-gradient(ellipse_at_50%_0%,#dfecfc,transparent_60%)] px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))] sm:px-6">
    <div className="flex min-h-fit w-full max-w-md flex-col gap-5 py-2 sm:gap-6">
      <header className="flex shrink-0 items-center justify-between gap-3"><div className="flex items-center gap-2.5"><span className="grid size-11 place-items-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/15"><SmartphoneRounded /></span><div><p className="text-sm font-extrabold tracking-tight text-brand">infomil<span className="text-accent">.</span></p><h1 className="text-xs font-medium text-muted">Télécommande</h1></div></div><span className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold ${fresh ? 'border-green-200 bg-green-50 text-green-800' : 'border-slate-200 bg-white/80 text-muted'}`}><span className={`size-1.5 rounded-full ${fresh ? 'bg-green-600' : 'bg-slate-400'}`} />{fresh ? 'Connectée' : 'Hors ligne'}</span></header>
      <section className="relative flex flex-1 flex-col items-center justify-center gap-5 rounded-[32px] border border-white bg-white/90 p-5 text-center shadow-[0_24px_80px_-40px_#205f9d70] sm:p-7" aria-label="État du minuteur">
        <div className="w-full"><p className="truncate text-xs font-semibold tracking-wide text-muted">{snapshot?.teamName || 'Votre point quotidien'}</p><p className="mt-4 text-[10px] font-bold tracking-[.2em] text-brand uppercase">{finished ? 'Merci à toute l’équipe' : 'La parole est à'}</p><h2 className="mt-2 break-words text-3xl leading-tight font-extrabold tracking-tight text-ink sm:text-4xl">{snapshot?.speaker || (finished ? 'Bravo !' : 'À vous de jouer')}</h2></div>
        <div className={`relative grid aspect-square w-[min(58vw,240px)] shrink-0 place-content-center rounded-full border-[10px] ${remaining < 0 && fresh ? 'border-orange-100 bg-orange-50/50' : 'border-blue-50 bg-slate-50/60'} shadow-[inset_0_0_0_1px_#e2e8f0]`}>
          <span className={`text-[clamp(36px,12vw,56px)] leading-none font-extrabold tracking-tight tabular-nums ${remaining < 0 && fresh ? 'text-orange-700' : 'text-brand'}`} aria-label="Temps restant">{fresh && snapshot ? time : '—:—'}</span>
          <span className="mt-3 text-[11px] font-medium text-muted">{snapshot?.running && fresh ? 'Gardons le bon rythme' : 'Chaque voix compte'}</span>
        </div>
        <p className="min-h-5 text-xs font-semibold text-muted">{stateLabel}</p>
        {snapshot && <div className="flex w-full items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-left"><div className="min-w-0"><p className="text-[10px] font-semibold text-muted">Prochaine voix</p><p className="mt-1 truncate text-sm font-bold text-ink">{snapshot.nextSpeaker || 'Dernier passage'}</p></div><span className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-bold text-brand tabular-nums">{snapshot.completed}/{snapshot.total}</span></div>}
      </section>
      <section className="flex shrink-0 flex-col gap-3" aria-label="Commandes à distance">
        <motion.button whileTap={{ scale: .98 }} type="button" disabled={!usable} onClick={() => void command(snapshot?.running ? 'pause' : 'start')} className={`flex min-h-18 w-full items-center justify-center gap-3 rounded-3xl text-lg font-bold shadow-lg transition-colors focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none ${snapshot?.running ? 'bg-ink text-white shadow-slate-900/10' : 'bg-brand text-white shadow-brand/20'}`}>{snapshot?.running ? <PauseRounded sx={{ fontSize: 30 }} /> : <PlayArrowRounded sx={{ fontSize: 30 }} />}{pending ? 'Transmission…' : snapshot?.running ? 'Mettre en pause' : 'Démarrer / reprendre'}</motion.button>
        {confirmNext && confirmNext === snapshot?.version && usable ? <div className="rounded-3xl border border-orange-200 bg-orange-50 p-4"><p className="text-sm font-bold text-ink">Terminer ce passage ?</p><p className="mt-1 text-xs leading-relaxed text-muted">{snapshot?.nextSpeaker ? `${snapshot.nextSpeaker} prendra la parole immédiatement.` : 'Ce passage sera terminé sur l’ordinateur.'}</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirmNext(null)} className="min-h-12 rounded-xl bg-white text-sm font-semibold text-brand">Annuler</button><button type="button" onClick={() => void command('next')} className="min-h-12 rounded-xl bg-brand text-sm font-bold text-white">Confirmer</button></div></div> : <button type="button" disabled={!usable} onClick={() => setConfirmNext(snapshot?.version ?? null)} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-line bg-white text-sm font-bold text-brand transition-colors hover:bg-blue-50 focus-visible:outline-3 focus-visible:outline-brand disabled:text-slate-400"><SkipNextRounded />Passage suivant</button>}
        <p role="status" aria-live="polite" className="min-h-8 text-center text-xs leading-relaxed text-muted">{invalid && <LinkOffRounded className="mr-1" fontSize="inherit" />}{message || (snapshot?.blocked ? 'Fermez la fenêtre sur l’ordinateur pour reprendre le contrôle.' : 'Les commandes sont appliquées sur l’ordinateur.')}</p>
      </section>
      <footer className="flex shrink-0 items-center justify-center gap-1.5 pb-1 text-[10px] text-muted"><ShieldOutlined fontSize="inherit" />Lien privé · aucun téléchargement{connection?.transport === 'instance' ? ' · serveur unique' : ''}</footer>
    </div>
  </div>;
}