'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import SkipNextRounded from '@mui/icons-material/SkipNextRounded';
import SmartphoneRounded from '@mui/icons-material/SmartphoneRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import DesktopWindowsRounded from '@mui/icons-material/DesktopWindowsRounded';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { type RemoteCommand } from '@/lib/remote/timer-remote';
import { type RemoteSnapshot, type RemoteStatus, type RemoteTransport } from '@/lib/remote/timer-remote';
import { CompanionInstall } from '@/components/remote/companion-install';
import { COMPANION_PAIRING_KEY, COMPANION_PHONE_KEY, resolveCompanionPairing } from '@/lib/remote/companion-pairing';

interface Connection { snapshot: RemoteSnapshot | null; status: RemoteStatus; transport: RemoteTransport; serverNow: number; receivedMono: number; roundTripMs: number }
interface Credentials { id: string; token: string; phoneId: string }

function newPhoneId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function validPhoneId(value: string | null): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

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
  const [confirmPenalty, setConfirmPenalty] = useState<string | null>(null);
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
    let phoneId: string | null = null;
    try { phoneId = localStorage.getItem(COMPANION_PHONE_KEY); } catch { /* Use an in-memory identity when storage is blocked. */ }
    if (!validPhoneId(phoneId)) {
      phoneId = newPhoneId();
      try { localStorage.setItem(COMPANION_PHONE_KEY, phoneId); } catch { /* The phone can still control this visit. */ }
    }
    try { localStorage.setItem(COMPANION_PAIRING_KEY, `${id}.${token}`); }
    catch { setStorageNotice('Association non mémorisée : le stockage du navigateur est bloqué. Conservez le lien ou scannez à nouveau le QR code à la prochaine ouverture.'); }
    credentials.current = { id, token, phoneId };
    let stopped = false;
    let busy = false;
    const controller = new AbortController();
    async function read() {
      if (busy || stopped || document.hidden) return;
      busy = true;
      try {
        const sentAt = performance.now();
        const response = await fetch(`/api/timer-remote?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}`, 'X-Remote-Phone-Id': phoneId! }, cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]) });
        const body = await response.json();
        if (stopped) return;
        if (response.status === 409 && body.code === 'REMOTE_PHONE_IN_USE') {
          setConnection(null);
          setMessage('Un autre téléphone est déjà connecté. Demandez à l’ordinateur de le déconnecter.');
          return;
        }
        if (response.status === 409 && body.code === 'REMOTE_PHONE_DISCONNECTED') {
          setConnection(null);
          setMessage('Cette télécommande a été déconnectée depuis l’ordinateur. Attendez sa réactivation.');
          return;
        }
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
    const poll = setInterval(() => void read(), 500);
    const clock = setInterval(() => { if (!document.hidden) setNow(performance.now()); }, 250);
    const leave = () => {
      stopped = true;
      void fetch('/api/timer-remote', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Remote-Phone-Id': phoneId! },
        body: JSON.stringify({ operation: 'phone-leave', id }), keepalive: true,
      }).catch(() => {});
    };
    const resume = () => { stopped = false; void read(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', resume);
    void read();
    return () => { mounted.current = false; stopped = true; controller.abort(); clearInterval(poll); clearInterval(clock); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', visible); window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', resume); };
  }, []);

  const snapshot = connection?.snapshot;
  const fresh = Boolean(connection && connection.status === 'online' && now - connection.receivedMono < 3500);
  const usable = fresh && Boolean(snapshot?.activeId) && !snapshot?.blocked && !pending && !invalid;
  const remaining = snapshot ? snapshot.running && fresh ? (snapshot.deadline - connection!.serverNow - (now - connection!.receivedMono)) / 1000 : snapshot.remaining : 0;
  const seconds = Math.ceil(Math.abs(remaining));
  const time = `${remaining < 0 ? '+' : ''}${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  const finished = Boolean(snapshot && snapshot.completed === snapshot.total && snapshot.total > 0);
  const people = snapshot?.participants ?? [];

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

  async function command(action: RemoteCommand['action'], targetIndex?: number) {
    if (!usable || !snapshot || !credentials.current || pendingRef.current || (snapshot.blackScreen && action !== 'black-screen')) return;
    pendingRef.current = true; setPending(true); setConfirmNext(null);
    setConfirmRestart(null);
    setConfirmPenalty(null);
    try {
      // getRandomValues also works on an HTTP LAN preview, unlike randomUUID.
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      const requestId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      const response = await fetch('/api/timer-remote', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.current.token}`, 'X-Remote-Phone-Id': credentials.current.phoneId }, body: JSON.stringify({ operation: 'command', id: credentials.current.id, command: { requestId, action, version: snapshot.version, ...(targetIndex === undefined ? {} : { targetIndex }) } }), signal: AbortSignal.timeout(5000) });
      if (!mounted.current) return;
      if (response.ok) awaitingVersion.current = snapshot.version;
      setMessage(response.ok ? 'Commande envoyée · en attente du minuteur.' : response.status === 409 ? 'Le minuteur a changé. Réessayez après synchronisation.' : 'Commande non envoyée. Vérifiez la connexion.');
      await refresh.current();
    } catch { if (mounted.current) setMessage('Envoi non confirmé. Vérifiez le minuteur avant de réessayer.'); }
    finally { if (!awaitingVersion.current) { pendingRef.current = false; if (mounted.current) setPending(false); } }
  }

  return <div className="relative flex min-h-0 flex-1 justify-center overflow-y-auto overscroll-contain bg-[#f2f5f4] px-3 pt-[max(10px,env(safe-area-inset-top))] sm:px-6">
    <div className="flex min-h-full w-full max-w-xl flex-col">
      <header className="sticky top-0 z-20 -mx-3 flex shrink-0 items-center justify-between gap-3 border-b border-[#dce4e1] bg-[#f7f9f8]/95 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-white"><SmartphoneRounded fontSize="small" /></span>
          <div className="min-w-0"><p className="text-[11px] font-extrabold text-brand">INFOMIL<span className="text-accent">.</span></p><h1 className="truncate text-sm font-bold text-ink">Télécommande</h1></div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${fresh ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : invalid ? 'border-red-200 bg-red-50 text-red-900' : 'border-slate-300 bg-white text-slate-700'}`} role="status" aria-live="polite">
          <span className={`size-2 rounded-full ${fresh ? 'bg-emerald-600' : invalid ? 'bg-red-600' : 'bg-slate-500'}`} />{fresh ? 'En ligne' : invalid ? 'Lien invalide' : 'Hors ligne'}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-3 py-3 pb-4">
        {snapshot?.page === 'participants' && <section aria-labelledby="remote-presence-title" className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3 px-1">
            <div><p className="text-[10px] font-bold uppercase text-brand">Étape 1 · Présences</p><h2 id="remote-presence-title" className="text-xl font-bold text-ink">Toute l’équipe</h2></div>
            <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{people.filter(person => person.present).length} présents · {people.length} personnes</span>
          </div>
          <ol aria-label="Présences de l’équipe" className="flex flex-col gap-2">
            {people.map((person, index) => <li key={`${index}-${person.name}`} aria-current={person.active ? 'true' : undefined} className={`flex min-h-[72px] items-center gap-3 rounded-lg border bg-white p-3 ${person.active ? 'border-brand ring-2 ring-brand/15' : 'border-[#dce4e1]'}`}>
              <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${person.present ? 'bg-[#e6f4ed] text-[#176b49]' : 'bg-slate-100 text-slate-600'}`}>{Array.from(person.name)[0]?.toLocaleUpperCase('fr-FR')}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-ink">{person.name}</p><p className={`mt-0.5 text-xs font-medium ${person.present ? 'text-[#176b49]' : 'text-slate-600'}`}>{person.present ? 'Présent(e)' : 'Absent(e)'}{person.active ? ' · Sélectionné(e)' : ''}</p></div>
              <button type="button" aria-pressed={person.present} aria-label={`${person.present ? 'Marquer absent(e)' : 'Marquer présent(e)'} · ${person.name}`} disabled={!usable || pending} onClick={() => void command('attendance-toggle', index)} className={`min-h-11 min-w-11 rounded-lg border px-3 text-xs font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600 ${person.present ? 'border-slate-400 bg-white text-ink' : 'border-[#176b49] bg-[#176b49] text-white'}`}>{person.present ? 'Absent(e)' : 'Présent(e)'}</button>
            </li>)}
          </ol>
          {!people.length && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-700">Aucune personne dans l’équipe.</p>}
        </section>}

        {snapshot?.page === 'mood' && <section aria-labelledby="remote-mood-title" className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3 px-1">
            <div><p className="text-[10px] font-bold uppercase text-brand">Étape 2 · Humeurs</p><h2 id="remote-mood-title" className="text-xl font-bold text-ink">Toute l’équipe</h2></div>
            <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{people.filter(person => person.mood !== null || person.postponed).length} / {people.length} prêtes</span>
          </div>
          <p className="px-1 text-xs leading-relaxed text-slate-700">Choisissez une humeur pour chaque personne présente, ou indiquez « Plus tard ».</p>
          <ol aria-label="Humeurs de l’équipe" className="flex flex-col gap-2">
            {people.map((person, index) => <li key={`${index}-${person.name}`} aria-current={person.active ? 'true' : undefined} className={`rounded-lg border bg-white p-3 ${person.active ? 'border-brand ring-2 ring-brand/15' : 'border-[#dce4e1]'}`}>
              <div className="mb-2 flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${person.postponed ? 'bg-amber-100 text-amber-900' : person.mood !== null ? 'bg-[#e6f4ed] text-[#176b49]' : 'bg-blue-50 text-brand'}`}>{Array.from(person.name)[0]?.toLocaleUpperCase('fr-FR')}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-ink">{person.name}</p><p className="text-xs text-slate-700">{person.postponed ? 'À renseigner plus tard' : person.mood !== null ? `Humeur ${person.mood} sur 4` : 'Humeur à renseigner'}</p></div>
                <button type="button" aria-pressed={person.postponed} aria-label={`${person.postponed ? 'Reprendre' : 'Reporter'} l’humeur de ${person.name}`} disabled={!usable || !person.present || !snapshot.canPostpone || pending} onClick={() => void command('mood-postpone', index)} className="min-h-11 shrink-0 rounded-lg border border-amber-700 bg-amber-50 px-3 text-xs font-bold text-amber-950 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-amber-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600">{person.postponed ? 'Reprendre' : 'Plus tard'}</button>
              </div>
              <div className="grid grid-cols-4 gap-2" role="group" aria-label={`Humeur de ${person.name}`}>
                {([
                  ['1', 'mood-1', 'border-red-700 bg-red-50 text-red-950 aria-pressed:bg-red-700 aria-pressed:text-white'],
                  ['2', 'mood-2', 'border-blue-700 bg-blue-50 text-blue-950 aria-pressed:bg-blue-700 aria-pressed:text-white'],
                  ['3', 'mood-3', 'border-green-700 bg-green-50 text-green-950 aria-pressed:bg-green-700 aria-pressed:text-white'],
                  ['4', 'mood-4', 'border-yellow-700 bg-yellow-50 text-yellow-950 aria-pressed:bg-yellow-400 aria-pressed:text-yellow-950'],
                ] as const).map(([value, action, color]) => <button key={value} type="button" aria-label={`Humeur ${value} pour ${person.name}`} aria-pressed={person.mood === Number(value)} disabled={!usable || !person.present || !snapshot.canVote || pending} onClick={() => void command(action, index)} className={`min-h-11 rounded-lg border-2 text-sm font-extrabold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600 ${color}`}>{value}</button>)}
              </div>
            </li>)}
          </ol>
          {!people.length && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-700">Aucune personne présente.</p>}
        </section>}

        {snapshot?.page === 'timer' && <>
          <section aria-label="Passage en cours" className="rounded-lg border border-[#dce4e1] bg-white p-4">
            <div className="flex items-center justify-between gap-3"><p className="truncate text-xs font-semibold text-slate-700">{snapshot.teamName || 'Point quotidien'}</p><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${snapshot.running && fresh ? 'bg-[#e6f4ed] text-[#176b49]' : finished ? 'bg-[#e6f4ed] text-[#176b49]' : 'bg-amber-50 text-amber-950'}`}>{finished ? 'Terminé' : snapshot.running ? 'En cours' : 'En pause'}</span></div>
            <p className="mt-4 text-[10px] font-bold uppercase text-brand">{finished ? 'Merci à toute l’équipe' : 'La parole est à'}</p>
            <h2 className="mt-1 wrap-anywhere text-2xl leading-tight font-bold text-ink">{snapshot.speaker || (finished ? 'Bravo !' : 'À vous de jouer')}</h2>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3"><span className="text-xs font-semibold text-slate-700">{remaining < 0 && fresh ? 'Dépassement' : 'Temps restant'}</span><span aria-label="Temps restant" className={`text-3xl font-extrabold tabular-nums ${remaining < 0 && fresh ? 'text-red-800' : 'text-brand'}`}>{fresh && snapshot ? time : '—:—'}</span></div>
            {snapshot.blackScreen && <p className="mt-3 rounded-md bg-slate-100 p-2 text-xs font-semibold text-slate-800">Économiseur actif · minuteur en pause.</p>}
          </section>
          <section aria-labelledby="remote-lineup-title" className="flex flex-col gap-2">
            <div className="flex items-end justify-between gap-3 px-1"><div><p className="text-[10px] font-bold uppercase text-brand">Étape 3 · Passage</p><h2 id="remote-lineup-title" className="text-lg font-bold text-ink">Ordre de parole</h2></div><span className="shrink-0 text-xs font-semibold text-slate-700">{snapshot.completed} / {snapshot.total} terminés</span></div>
            <ol aria-label="Ordre de parole" className="flex flex-col gap-2">
              {people.map((person, index) => <li key={`${index}-${person.name}`} aria-current={person.active ? 'step' : undefined} className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 ${person.active ? 'border-brand bg-[#eaf2f8] ring-2 ring-brand/15' : person.done ? 'border-[#b9daca] bg-[#edf7f1]' : 'border-[#dce4e1] bg-white'}`}>
                <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${person.active ? 'bg-brand text-white' : person.done ? 'bg-[#176b49] text-white' : 'bg-slate-100 text-slate-700'}`}>{person.done ? '✓' : index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{person.name}</span>
                <span className={`shrink-0 text-[11px] font-semibold ${person.active ? 'text-brand' : person.postponed ? 'text-amber-900' : person.done ? 'text-[#176b49]' : 'text-slate-600'}`}>{person.active ? 'En cours' : person.postponed ? 'En attente' : person.done ? 'Terminé' : 'À venir'}</span>
              </li>)}
            </ol>
          </section>
        </>}

        {!snapshot && <section className="grid min-h-64 content-center justify-items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
          {invalid ? <LinkOffRounded className="text-red-700" fontSize="large" /> : <SmartphoneRounded className="text-brand" fontSize="large" />}
          <h2 className="text-lg font-bold text-ink">{invalid ? 'Association indisponible' : 'En attente de l’ordinateur'}</h2>
          <p className="max-w-sm text-sm leading-relaxed text-slate-700">{message || 'Ouvrez Participants, Humeurs ou Minuteur sur l’ordinateur. La télécommande suivra automatiquement la page active.'}</p>
        </section>}
      </div>

      <footer className="sticky bottom-0 z-20 -mx-3 mt-auto border-t border-[#dce4e1] bg-[#f7f9f8]/95 px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-md sm:-mx-6 sm:px-6">
        {snapshot?.page === 'participants' && <button type="button" disabled={!usable || !snapshot.canContinue || pending} onClick={() => void command('participant-continue')} className="min-h-12 w-full rounded-lg bg-brand px-4 text-sm font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700">Continuer vers les humeurs</button>}
        {snapshot?.page === 'mood' && <button type="button" disabled={!usable || !snapshot.canContinue || pending} onClick={() => void command('mood-continue')} className="min-h-12 w-full rounded-lg bg-brand px-4 text-sm font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700">Continuer vers le minuteur</button>}
        {snapshot?.page === 'timer' && <section className="flex flex-col gap-2" aria-label="Commandes à distance">
          {confirmNext && confirmNext === snapshot.version && usable && !snapshot.blackScreen ? <div className="rounded-lg border border-orange-300 bg-orange-50 p-3"><p className="text-sm font-bold text-ink">Terminer ce passage ?</p><p className="mt-1 text-xs leading-relaxed text-slate-700">{snapshot.nextSpeaker ? `${snapshot.nextSpeaker} prendra la parole immédiatement.` : 'Ce passage sera terminé sur l’ordinateur.'}</p><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirmNext(null)} className="min-h-11 rounded-lg border border-slate-500 bg-white text-sm font-semibold text-ink">Annuler</button><button type="button" onClick={() => void command('next')} className="min-h-11 rounded-lg bg-brand text-sm font-bold text-white">Confirmer</button></div></div> : <div className="grid grid-cols-[1fr_1.2fr] gap-2">
            <motion.button whileTap={reducedMotion ? undefined : { scale: .98 }} type="button" disabled={!usable || snapshot.blackScreen} aria-label={pending ? 'Transmission…' : snapshot.running ? 'Mettre en pause' : 'Démarrer / reprendre'} onClick={() => void command(snapshot.running ? 'pause' : 'start')} className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-brand bg-white px-2 text-sm font-bold text-brand focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-600">
              {snapshot.running ? <PauseRounded fontSize="small" /> : <PlayArrowRounded fontSize="small" />}{pending ? 'Envoi…' : snapshot.running ? 'Pause' : 'Reprendre'}
            </motion.button>
            <button type="button" aria-label="Passage suivant" disabled={!usable || snapshot.blackScreen} onClick={() => setConfirmNext(snapshot.version)} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#a84f0b] px-3 text-sm font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700"><SkipNextRounded fontSize="small" />Suivant</button>
          </div>}
          <div className="grid grid-cols-3 gap-2">
            <button type="button" aria-label="Redémarrer" disabled={!usable || snapshot.blackScreen} onClick={() => setConfirmRestart(snapshot.version)} className="min-h-11 rounded-lg border border-slate-400 bg-white px-1 text-xs font-semibold text-ink focus-visible:outline-3 focus-visible:outline-brand disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"><RestartAltRounded className="mr-1" fontSize="small" />Redémarrer</button>
            <button type="button" aria-label="Pénalité de 50 points" disabled={!usable || snapshot.blackScreen || (snapshot.manualPenalty ?? 0) > 999_950} onClick={() => setConfirmPenalty(snapshot.version)} className="min-h-11 rounded-lg border border-amber-700 bg-amber-50 px-1 text-xs font-semibold text-amber-950 focus-visible:outline-3 focus-visible:outline-brand disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"><WarningAmberRounded className="mr-1" fontSize="small" />−50</button>
            <button type="button" aria-pressed={snapshot.blackScreen ?? false} aria-label={snapshot.blackScreen ? 'Quitter l’économiseur' : 'Économiseur d’écran'} disabled={!usable} onClick={() => void command('black-screen')} className="min-h-11 rounded-lg border border-slate-400 bg-white px-1 text-xs font-semibold text-ink focus-visible:outline-3 focus-visible:outline-brand disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"><DesktopWindowsRounded className="mr-1" fontSize="small" />{snapshot.blackScreen ? 'Revenir' : 'Économiseur'}</button>
          </div>
          {(snapshot.manualPenalty ?? 0) > 0 && <p className="text-center text-xs font-semibold text-amber-950">Pénalités manuelles : −{snapshot.manualPenalty} points</p>}
        </section>}
      </footer>

      <div className="flex flex-col gap-2 py-3">
        <p role="status" aria-live="polite" className="px-2 text-center text-xs leading-relaxed text-slate-700">{invalid && <LinkOffRounded className="mr-1" fontSize="inherit" />}{message || (snapshot?.blocked ? 'Fermez la fenêtre sur l’ordinateur pour reprendre le contrôle.' : fresh ? 'Synchronisé avec l’ordinateur.' : 'Connexion en attente.')}</p>
        {connection && connection.roundTripMs > 1000 && <p role="note" className="rounded-lg bg-amber-50 p-2 text-center text-xs leading-relaxed text-amber-950">Réseau lent · aller-retour {Math.round(connection.roundTripMs)} ms. Les commandes attendent la confirmation de l’ordinateur.</p>}
        {storageNotice && <p role="note" className="rounded-lg bg-amber-50 p-2 text-xs leading-relaxed text-amber-950">{storageNotice}</p>}
        <CompanionInstall />
        {connection && <button type="button" onClick={() => {
          try { localStorage.removeItem(COMPANION_PAIRING_KEY); } catch { /* Clear the current page even when storage is blocked. */ }
          location.replace('/remote');
        }} className="min-h-11 rounded-lg text-xs font-semibold text-slate-700 underline decoration-slate-400 underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand">Oublier cette équipe sur ce téléphone</button>}
        <p className="flex items-center justify-center gap-1.5 pb-1 text-[10px] text-slate-600"><ShieldOutlined fontSize="inherit" />Lien privé · aucun téléchargement{connection?.transport === 'instance' ? ' · serveur unique' : ''}</p>
      </div>

      <Dialog open={Boolean(confirmRestart && confirmRestart === snapshot?.version && usable && !snapshot?.blackScreen)} onClose={() => setConfirmRestart(null)} aria-labelledby="remote-restart-title" aria-describedby="remote-restart-description" fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: '12px', border: '1px solid #dce3e1' } } }}>
        <DialogTitle id="remote-restart-title">Redémarrer ce passage ?</DialogTitle>
        <DialogContent><p id="remote-restart-description" className="text-sm leading-relaxed text-slate-700">Le décompte de {snapshot?.speaker} reviendra à sa durée initiale, en pause. Le temps déjà parlé et les pénalités sont conservés. La prochaine reprise comptera comme une nouvelle tentative.</p></DialogContent>
        <DialogActions><Button autoFocus onClick={() => setConfirmRestart(null)} sx={{ minHeight: 44 }}>Non</Button><Button onClick={() => void command('restart')} sx={{ minHeight: 44 }}>Oui, redémarrer</Button></DialogActions>
      </Dialog>
      <Dialog open={Boolean(confirmPenalty && confirmPenalty === snapshot?.version && usable && !snapshot?.blackScreen)} onClose={() => setConfirmPenalty(null)} aria-labelledby="remote-penalty-title" aria-describedby="remote-penalty-description" fullWidth maxWidth="xs" slotProps={{ paper: { sx: { border: '1px solid #dce3e1', borderRadius: '12px' } } }}>
        <DialogTitle id="remote-penalty-title">Ajouter une pénalité ?</DialogTitle>
        <DialogContent><p id="remote-penalty-description" className="text-sm leading-relaxed text-slate-700">Ajouter 50 points de pénalité à <strong>{snapshot?.speaker}</strong> pour ce passage ? Cette action ne peut pas être annulée depuis le téléphone.</p></DialogContent>
        <DialogActions><Button autoFocus onClick={() => setConfirmPenalty(null)} sx={{ minHeight: 44 }}>Annuler</Button><Button variant="contained" color="warning" onClick={() => void command('penalty')} sx={{ minHeight: 44 }}>Ajouter −50 points</Button></DialogActions>
      </Dialog>
    </div>
  </div>;
}