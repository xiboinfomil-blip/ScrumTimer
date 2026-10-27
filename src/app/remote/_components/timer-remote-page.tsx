'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import SkipNextRounded from '@mui/icons-material/SkipNextRounded';
import SmartphoneRounded from '@mui/icons-material/SmartphoneRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import DesktopWindowsRounded from '@mui/icons-material/DesktopWindowsRounded';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { type RemoteCommand } from '@/lib/timer-remote';
import { type RemoteSnapshot, type RemoteStatus, type RemoteTransport } from '@/lib/timer-remote';
import { CompanionInstall } from '@/components/remote/companion-install';
import { COMPANION_PAIRING_KEY, resolveCompanionPairing } from '@/lib/companion-pairing';

interface Connection { snapshot: RemoteSnapshot | null; status: RemoteStatus; transport: RemoteTransport; serverNow: number; receivedMono: number; roundTripMs: number }
interface Credentials { id: string; token: string }

export function TimerRemotePage() {
  const reducedMotion = useReducedMotion();
  const credentials = useRef<Credentials | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [message, setMessage] = useState('Connexion au minuteur…');
  const [invalid, setInvalid] = useState(false);
  const [storageNotice, setStorageNotice] = useState('');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const awaitingVersion = useRef<string | null>(null);
  const [now, setNow] = useState(0);
  const [confirmNext, setConfirmNext] = useState<string | null>(null);
  const [confirmRestart, setConfirmRestart] = useState<string | null>(null);
  const mounted = useRef(false);
  const refresh = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    mounted.current = true;
    // Fragment capabilities are never included in HTTP URLs or referrers.
    let stored: string | null = null;
    try { stored = localStorage.getItem(COMPANION_PAIRING_KEY); } catch { /* Pairing still works for this visit. */ }
    const pairing = resolveCompanionPairing(location.hash, stored);
    if (!pairing) {
      setInvalid(true); setMessage('Ce lien est incomplet. Scannez le QR code affiché sur le minuteur.');
      return () => { mounted.current = false; };
    }
    const { id, token } = pairing;
    try { localStorage.setItem(COMPANION_PAIRING_KEY, `${id}.${token}`); }
    catch { setStorageNotice('Association non mémorisée : le stockage du navigateur est bloqué. Conservez le lien ou scannez à nouveau le QR code à la prochaine ouverture.'); }
    credentials.current = { id, token };
    let stopped = false;
    let busy = false;
    const controller = new AbortController();
    async function read() {
      if (busy || stopped || document.hidden) return;
      busy = true;
      try {
        const sentAt = performance.now();
        const response = await fetch(`/api/timer-remote?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]) });
        const body = await response.json();
        if (stopped) return;
        if (response.status === 401 || response.status === 404) {
          stopped = true; setInvalid(true); setConnection(null); setMessage('Ce lien n’est plus valide. Scannez le QR code actuel de votre équipe.'); return;
        }
        if (!response.ok) throw new Error();
        const receivedMono = performance.now();
        const roundTripMs = receivedMono - sentAt;
        // Approximate the return trip; the computer remains authoritative.
        setConnection({ snapshot: body.snapshot, status: body.status, transport: body.transport, serverNow: body.serverNow + roundTripMs / 2, receivedMono, roundTripMs });
        setMessage(body.status === 'online' ? '' : 'Votre équipe est associée. Activez la télécommande sur le minuteur de l’ordinateur pour commencer.');
        setNow(performance.now());
      } catch { if (!stopped) { setConnection(null); setMessage('Connexion interrompue. Reconnexion automatique…'); } }
      finally { busy = false; }
    }
    refresh.current = read;
    const visible = () => { if (!document.hidden) void read(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    void read();
    const poll = setInterval(() => void read(), 500);
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
  const stateLabel = invalid ? 'Lien indisponible' : !fresh ? 'En attente de connexion' : finished ? 'Point terminé' : snapshot?.blocked ? 'Action sur l’ordinateur' : snapshot?.running ? 'Le passage est en cours' : 'Prêt à votre rythme';

  useEffect(() => {
    if (!pending) return;
    if (awaitingVersion.current && snapshot?.version !== awaitingVersion.current) {
      awaitingVersion.current = null; pendingRef.current = false; setPending(false);
      return;
    }
    const timeout = setTimeout(() => {
      awaitingVersion.current = null; pendingRef.current = false; setPending(false);
      setMessage('Confirmation tardive. Vérifiez l’ordinateur avant de réessayer.');
    }, 5500);
    return () => clearTimeout(timeout);
  }, [pending, snapshot?.version]);

  async function command(action: RemoteCommand['action']) {
    if (!usable || !snapshot || !credentials.current || pendingRef.current || (snapshot.blackScreen && action !== 'black-screen')) return;
    pendingRef.current = true; setPending(true); setConfirmNext(null);
    setConfirmRestart(null);
    try {
      // getRandomValues also works on an HTTP LAN preview, unlike randomUUID.
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      const requestId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      const response = await fetch('/api/timer-remote', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.current.token}` }, body: JSON.stringify({ operation: 'command', id: credentials.current.id, command: { requestId, action, version: snapshot.version } }), signal: AbortSignal.timeout(5000) });
      if (!mounted.current) return;
      if (response.ok) awaitingVersion.current = snapshot.version;
      setMessage(response.ok ? 'Commande envoyée · en attente du minuteur.' : response.status === 409 ? 'Le minuteur a changé. Réessayez après synchronisation.' : 'Commande non envoyée. Vérifiez la connexion.');
      await refresh.current();
    } catch { if (mounted.current) setMessage('Envoi non confirmé. Vérifiez le minuteur avant de réessayer.'); }
    finally { if (!awaitingVersion.current) { pendingRef.current = false; if (mounted.current) setPending(false); } }
  }

  return <div className="flex min-h-0 flex-1 justify-center overflow-y-auto overscroll-contain bg-slate-50 px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))] sm:px-8">
    <div className="flex min-h-fit w-full max-w-md flex-col gap-3 py-1 sm:gap-4 sm:py-4">
      <header className="flex shrink-0 items-center justify-between gap-3 px-1"><div className="flex items-center gap-2.5"><span className="grid size-10 place-items-center rounded-2xl border border-brand/10 bg-white text-brand"><SmartphoneRounded fontSize="small" /></span><div><p className="text-sm font-extrabold tracking-tight text-brand">infomil<span className="text-accent">.</span></p><h1 className="text-xs font-medium text-slate-600">Télécommande</h1></div></div><span className={`flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-semibold ${fresh ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}><span className={`size-1.5 rounded-full ${fresh ? 'bg-emerald-600' : 'bg-slate-400'}`} />{fresh ? 'Connectée' : 'Hors ligne'}</span></header>
      <div className="grid shrink-0 gap-5 border-y border-line py-5 sm:gap-6 sm:py-6">
        <section className="flex min-w-0 flex-col items-center text-center" aria-label="Passage en cours">
          <div className="min-w-0 w-full">
            <p className="mx-auto flex w-fit max-w-full items-center gap-1.5 rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold text-slate-600"><span className={`size-1.5 shrink-0 rounded-full ${fresh ? 'bg-brand' : 'bg-slate-400'}`} /><span className="truncate">{snapshot?.teamName || 'Votre point quotidien'}{fresh ? ' · Session active' : ''}</span></p>
            <p className="mt-4 text-[10px] font-bold tracking-[.12em] text-brand uppercase">{finished ? 'Merci à toute l’équipe' : 'La parole est à'}</p>
            <h2 className="mt-1 line-clamp-3 wrap-anywhere text-3xl leading-tight font-bold text-ink sm:text-4xl">{snapshot?.speaker || (finished ? 'Bravo !' : 'À vous de jouer')}</h2>
            <div className={`mx-auto mt-2 flex w-fit max-w-full flex-wrap items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 ${remaining < 0 && fresh ? 'border-orange-100 bg-orange-50 text-orange-800' : 'border-slate-100 bg-slate-50 text-slate-600'}`}>
              <ScheduleRounded className="!text-[14px]" />
              <span aria-label="Temps restant" className="text-sm leading-none font-bold tracking-tight tabular-nums">{fresh && snapshot ? time : '—:—'}</span>
              <span className="text-[9px] font-semibold tracking-wide uppercase">{remaining < 0 && fresh ? 'Dépassement' : 'Restant'}</span>
            </div>
            <p className={`mx-auto mt-3 w-fit max-w-full rounded-lg border px-2.5 py-1 text-[10px] font-semibold ${fresh && snapshot?.running && !snapshot.blocked ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-slate-100 bg-slate-50 text-slate-600'}`}>{stateLabel}</p>
          </div>
        </section>
        <section className="flex min-w-0 flex-col gap-3" aria-label="Commandes à distance">
          <motion.button whileTap={reducedMotion ? undefined : { scale: .98 }} type="button" disabled={!usable || snapshot?.blackScreen} aria-label={pending ? 'Transmission…' : snapshot?.running ? 'Mettre en pause' : 'Démarrer / reprendre'} onClick={() => void command(snapshot?.running ? 'pause' : 'start')} className="flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-lg border border-brand/30 bg-white text-ink transition-colors hover:bg-blue-50 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand disabled:border-line disabled:bg-slate-100 disabled:text-slate-600 sm:min-h-44">
            <span className="mb-1 grid size-11 place-items-center rounded-2xl border border-slate-200/80 bg-white text-brand">{snapshot?.running ? <PauseRounded /> : <PlayArrowRounded />}</span>
            <span className="text-lg font-extrabold tracking-tight sm:text-xl">{pending ? 'Transmission…' : snapshot?.running ? 'Mettre en pause' : 'Démarrer / reprendre'}</span>
            <span className="text-[10px] font-medium text-slate-600">{pending ? 'En attente de l’ordinateur' : snapshot?.running ? 'Une pause, puis on reprend' : 'À vous de donner le rythme'}</span>
          </motion.button>
          {confirmNext && confirmNext === snapshot?.version && usable && !snapshot?.blackScreen ? <div className="rounded-2xl border border-orange-200 bg-orange-50 p-3 text-ink"><p className="text-sm font-bold">Terminer ce passage ?</p><p className="mt-1 break-words text-xs leading-relaxed text-slate-600">{snapshot?.nextSpeaker ? `${snapshot.nextSpeaker} prendra la parole immédiatement.` : 'Ce passage sera terminé sur l’ordinateur.'}</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirmNext(null)} className="min-h-12 rounded-xl border border-slate-500 bg-white text-sm font-semibold text-brand focus-visible:outline-3 focus-visible:outline-brand">Annuler</button><button type="button" onClick={() => void command('next')} className="min-h-12 rounded-xl bg-brand text-sm font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand">Confirmer</button></div></div> : <button type="button" disabled={!usable || snapshot?.blackScreen} onClick={() => setConfirmNext(snapshot?.version ?? null)} className="flex min-h-20 w-full items-center justify-between gap-3 rounded-[20px] border border-orange-700 bg-orange-700 px-4 py-3 text-left text-white shadow-[0_4px_10px_-5px_#c2410c80] transition-colors hover:bg-orange-800 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand disabled:border-slate-100 disabled:bg-slate-100 disabled:text-slate-600 disabled:shadow-none" aria-label="Passage suivant"><span className="min-w-0"><span className="block text-lg font-extrabold tracking-tight">Passage suivant</span><span className="mt-1 block truncate text-xs font-medium">{snapshot?.nextSpeaker ? `Prochain : ${snapshot.nextSpeaker}` : finished ? 'Point terminé' : 'Terminer le passage'}</span></span><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-black/10"><SkipNextRounded /></span></button>}
        </section>
        <section aria-label="Autres commandes" className="grid grid-cols-3 gap-2">
          <button type="button" disabled={!usable || snapshot?.blackScreen} onClick={() => setConfirmRestart(snapshot?.version ?? null)} className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-slate-500 bg-slate-50 px-1 text-[10px] font-semibold text-brand focus-visible:outline-3 focus-visible:outline-brand disabled:text-slate-600"><RestartAltRounded fontSize="small" />Redémarrer</button>
          <button type="button" disabled={!usable || snapshot?.blackScreen || (snapshot?.manualPenalty ?? 0) > 999_950} onClick={() => void command('penalty')} className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-amber-700 bg-amber-50 px-1 text-[10px] font-semibold text-amber-900 focus-visible:outline-3 focus-visible:outline-brand disabled:text-slate-600" aria-label="Pénalité de 50 points"><span className="flex items-center gap-1"><WarningAmberRounded fontSize="small" /><span>−50</span></span>Pénalité</button>
          <button type="button" disabled={!usable} onClick={() => void command('black-screen')} aria-pressed={snapshot?.blackScreen ?? false} className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-slate-500 bg-slate-50 px-1 text-[10px] font-semibold text-brand focus-visible:outline-3 focus-visible:outline-brand disabled:text-slate-600"><DesktopWindowsRounded fontSize="small" />{snapshot?.blackScreen ? 'Rétablir l’écran' : 'Écran noir'}</button>
        </section>
        {(snapshot?.manualPenalty ?? 0) > 0 && <p className="text-center text-xs font-semibold text-amber-900">Pénalités manuelles : −{snapshot?.manualPenalty} points</p>}
        {snapshot?.blackScreen && <p className="text-center text-xs text-slate-600">Écran masqué · minuteur en pause. Rétablissez l’écran avant de reprendre.</p>}
        <p className="border-t border-slate-100 pt-3 text-center text-[10px] leading-relaxed text-slate-600">Le minutage reste synchronisé sur l’ordinateur principal.</p>
      </div>
      <p role="status" aria-live="polite" className="px-2 text-center text-xs leading-relaxed text-slate-600">{invalid && <LinkOffRounded className="mr-1" fontSize="inherit" />}{message || (snapshot?.blocked ? 'Fermez la fenêtre sur l’ordinateur pour reprendre le contrôle.' : 'Vous pilotez. L’ordinateur affiche.')}</p>
      <CompanionInstall />
      <Dialog open={Boolean(confirmRestart && confirmRestart === snapshot?.version && usable && !snapshot?.blackScreen)} onClose={() => setConfirmRestart(null)} aria-labelledby="remote-restart-title" aria-describedby="remote-restart-description" fullWidth maxWidth="xs">
        <DialogTitle id="remote-restart-title">Redémarrer ce passage ?</DialogTitle>
        <DialogContent><p id="remote-restart-description" className="text-sm leading-relaxed text-slate-600">Le décompte de {snapshot?.speaker} reviendra à sa durée initiale, en pause. Le temps déjà parlé et les pénalités sont conservés. La prochaine reprise comptera comme une nouvelle tentative.</p></DialogContent>
        <DialogActions><Button autoFocus onClick={() => setConfirmRestart(null)} sx={{ minHeight: 44 }}>Non</Button><Button onClick={() => void command('restart')} sx={{ minHeight: 44 }}>Oui, redémarrer</Button></DialogActions>
      </Dialog>
      {connection && connection.roundTripMs > 1000 && <p role="note" className="text-center text-xs leading-relaxed text-amber-800">Réseau lent · aller-retour {Math.round(connection.roundTripMs)} ms. Les commandes attendent la confirmation de l’ordinateur.</p>}
      {storageNotice && <p role="note" className="text-center text-xs leading-relaxed text-amber-800">{storageNotice}</p>}
      {connection && <button type="button" onClick={() => {
        try { localStorage.removeItem(COMPANION_PAIRING_KEY); } catch { /* Clear the current page even when storage is blocked. */ }
        location.replace('/remote');
      }} className="min-h-11 rounded-xl text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand">Oublier cette équipe sur ce téléphone</button>}
      <footer className="flex shrink-0 items-center justify-center gap-1.5 pb-1 text-[10px] text-slate-600"><ShieldOutlined fontSize="inherit" />Lien privé · aucun téléchargement{connection?.transport === 'instance' ? ' · serveur unique' : ''}</footer>
    </div>
  </div>;
}