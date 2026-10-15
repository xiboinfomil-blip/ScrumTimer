'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { card } from '@/components/ui/styles';
import {
  chooseUnusedDeck, displayTitle, moodMeterId, isAnimatedImage, overlayCropStyle,
  overlayMatrix, type MoodMeterDeck, type MoodMeterSlide,
} from '../../../lib/mood-meter';
import { loadMoodCatalog, loadMoodDeck } from '@/lib/mood-catalog-client';
import { AnimatedImage } from './animated-image';
import { useTeam } from '@/providers/team-provider';
import { DefaultMoodMeter, MoodMeterLoading } from './default-mood-meter';
import { useNotify } from '@/providers/notification-provider';

const slideError = 'Diapositive indisponible. Le baromètre par défaut est affiché.';
const meterStage = 'meter-stage relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[14px] border border-line bg-slate-50';
const backgroundImage = 'block h-full w-full object-contain';

// Slide-local state is isolated by a key so old image events cannot affect a
// newly selected deck/slide, even if the same URL occurs more than once.
export function MeterSlide({ slide, title, paused, idPrefix = 'meter' }: {
  slide: MoodMeterSlide;
  title: string;
  paused: boolean;
  idPrefix?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(slide.aspectRatio ?? 16 / 9);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState<Set<number>>(() => new Set());
  const [snapshotWarning, setSnapshotWarning] = useState(false);
  const backgroundAnimated = isAnimatedImage(slide.image);

  useEffect(() => {
    if (!loading || failed) return;
    const timeout = setTimeout(() => setFailed(true), 45000);
    return () => clearTimeout(timeout);
  }, [loading, failed]);

  useEffect(() => {
    const stage = stageRef.current;
    const view = stage?.ownerDocument.defaultView;
    if (!stage || !view) return;
    let active = true;
    let frame = 0;
    const fit = () => {
      if (!active) return;
      const width = Math.min(stage.clientWidth, stage.clientHeight * ratio);
      const height = width / ratio;
      setSize(previous => previous.width === width && previous.height === height
        ? previous : { width, height });
    };
    const schedule = () => {
      view.cancelAnimationFrame(frame);
      frame = view.requestAnimationFrame(fit);
    };
    const observer = new view.ResizeObserver(schedule);
    observer.observe(stage);
    schedule();
    return () => { active = false; observer.disconnect(); view.cancelAnimationFrame(frame); };
  }, [ratio]);

  const loaded = useCallback((image: HTMLImageElement) => {
    setLoading(false);
    if (slide.aspectRatio === undefined && image.naturalHeight > 0) {
      setRatio(image.naturalWidth / image.naturalHeight || 16 / 9);
    }
  }, [slide.aspectRatio]);
  const backgroundError = useCallback(() => setFailed(true), []);
  const snapshotError = useCallback(() => setSnapshotWarning(true), []);

  return (
    <div className={meterStage} ref={stageRef}>
      {failed ? <DefaultMoodMeter /> : loading ? <MoodMeterLoading /> : null}
      <div id={`${idPrefix}-slide-wrapper`} className="relative max-h-full max-w-full shrink-0 overflow-hidden" hidden={failed} style={{ width: size.width, height: size.height }}>
        <AnimatedImage id={`${idPrefix}-slide`} className={backgroundImage} src={slide.image} alt={title} paused={paused}
          animated={backgroundAnimated} onLoad={loaded} onError={backgroundError}
          onSnapshotError={snapshotError} />
        <div id={`${idPrefix}-overlays`} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {slide.overlays.map((overlay, index) => missing.has(index) ? null : (
            <div className="absolute inset-0 origin-top-left overflow-hidden" key={index} style={{
              transform: overlayMatrix(overlay, ratio, size.width, size.height),
            }}>
              <AnimatedImage src={overlay.src} alt="" paused={paused}
                className="absolute block max-w-none object-fill" style={overlayCropStyle(overlay.crop)}
                onError={() => setMissing(previous => new Set(previous).add(index))}
                onSnapshotError={snapshotError} />
            </div>
          ))}
        </div>
      </div>
      <p id={`${idPrefix}-error`} role="status" hidden={!failed && !missing.size && !snapshotWarning}
        className="pointer-events-none absolute inset-x-0 bottom-0 grid place-content-center bg-orange-50 p-1.5 text-center text-[10px] leading-[1.8] text-danger">
        {failed ? slideError : snapshotWarning
          ? 'Impossible de figer une animation. Elle reste masquée pendant la pause.'
          : 'Une animation est indisponible. Le baromètre statique reste affiché.'}
      </p>
    </div>
  );
}

export function MoodMeter({ className = '', mobileVisible = true }: { className?: string; mobileVisible?: boolean }) {
  const { state, updateTeam, activeTeamId, setDailyReady, cloudStatus } = useTeam();
  const notify = useNotify();
  const [savingMeter, setSavingMeter] = useState(false);
  const changeController = useRef<AbortController | null>(null);
  useEffect(() => () => changeController.current?.abort(), []);
  const initialUsed = useRef(state.usedMoodMeters ?? []);
  const panelRef = useRef<HTMLElement>(null);
  // GIF playback is explicitly requested; Stop remains available at all times.
  const [paused, setPaused] = useState(false);
  const [catalog, setCatalog] = useState<MoodMeterDeck[]>([]);
  const [selection, setSelection] = useState({ deck: -1, slide: 0 });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [wide, setWide] = useState(false);
  const [conversion, setConversion] = useState<'idle' | 'loading' | 'error'>('idle');
  const [retry, setRetry] = useState(0);
  const [daily, setDaily] = useState<{ day: string; meter: { meterId: string; title: string } } | null>(null);

  useEffect(() => {
    const query = matchMedia('(min-width: 801px)');
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); setStatus('error'); }, 50000);
    let active = true;
    async function load() {
      try {
        const decks = await loadMoodCatalog(controller.signal);
        if (!active || controller.signal.aborted) return;
        const headers = { 'X-Team-Id': activeTeamId! };
        const response = await fetch('/api/daily-meter', { headers, cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('daily meter');
        let assigned = await response.json();
        if (!assigned.meter) {
          const candidate = chooseUnusedDeck(decks, initialUsed.current);
          const meter = candidate >= 0 ? { meterId: moodMeterId(decks[candidate]), title: decks[candidate].title } : { meterId: 'original', title: 'Baromètre original' };
          const saved = await fetch('/api/daily-meter', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(meter), signal: controller.signal });
          if (!saved.ok) throw new Error('daily meter save');
          assigned = await saved.json();
        }
        if (!active || controller.signal.aborted) return;
        if (!assigned.meter) throw new Error('missing daily meter');
        const selected = assigned.meter.meterId === 'original' ? -2 : decks.findIndex(item => moodMeterId(item) === assigned.meter.meterId);
        if (selected === -1) throw new Error('daily meter unavailable');
        setDaily(assigned);
        setCatalog(decks);
        setSelection({ deck: selected, slide: 0 });
        if (decks[selected]?.remoteId) setConversion('loading');
        setStatus('ready');
      } catch {
        if (active && !controller.signal.aborted) setStatus('error');
      } finally {
        clearTimeout(timeout);
      }
    }
    void load();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [activeTeamId]);

  const deck = catalog[selection.deck];
  const slide = deck?.slides[selection.slide];
  const title = deck ? displayTitle(deck) : 'Baromètre original';
  const pending = status === 'loading' || conversion === 'loading';
  const showSlide = slide && !pending && conversion !== 'error';
  const stacked = Boolean(deck?.remoteId && showSlide);
  useEffect(() => {
    if (!deck?.remoteId) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); setConversion('error'); }, 50000);
    // Refresh slide metadata when selecting a remote presentation.
    void loadMoodDeck(deck, controller.signal).then(converted => {
      if (controller.signal.aborted) return;
      setCatalog(current => current.map(item => item.remoteId === converted.remoteId ? converted : item));
      setConversion('idle');
    }).catch(() => { if (!controller.signal.aborted) setConversion('error'); }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
    // Selection/retry starts loading, not replacing the loaded deck.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck?.remoteId, retry]);
  useEffect(() => {
    const usable = Boolean(daily && !savingMeter && (selection.deck === -2 || showSlide));
    setDailyReady(usable);
    updateTeam(current => ({ ...current, currentMoodSlide: showSlide ? { title, image: slide.image, slideNumber: selection.slide + 1, meterId: moodMeterId(deck) } : null }));
    // Keep today's assigned slide available for late votes on the timer route.
    // The provider resets readiness when changing teams.
  }, [slide, showSlide, title, selection.slide, selection.deck, deck, updateTeam, daily, savingMeter, setDailyReady]);
  const autoplayAnimations = () => {
    setPaused(false);
  };
  const hasVotes = state.roster.some(person => person.mood !== null);
  const canChange = Boolean(daily && !hasVotes && !savingMeter && status === 'ready' && cloudStatus === 'saved');
  const selectDeck = async (index: number) => {
    if (!canChange || index === selection.deck || (index !== -2 && (!Number.isInteger(index) || !catalog[index]))) return;
    const controller = new AbortController();
    changeController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setSavingMeter(true);
    setDailyReady(false);
    try {
      const meter = index === -2 ? { meterId: 'original', title: 'Baromètre original' } : { meterId: moodMeterId(catalog[index]), title: catalog[index].title };
      const response = await fetch('/api/daily-meter', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Team-Id': activeTeamId! }, body: JSON.stringify(meter), signal: controller.signal });
      const assigned = await response.json();
      if (!response.ok) throw new Error(assigned.error ?? 'Changement non confirmé. Rechargez avant de voter.');
      if (controller.signal.aborted) return;
      setDaily(assigned);
      setConversion(catalog[index]?.remoteId ? 'loading' : 'idle');
      setSelection({ deck: index, slide: 0 });
      autoplayAnimations();
    } catch (error) {
      if (changeController.current !== controller) return;
      setStatus('error');
      setDaily(null);
      notify(error instanceof Error && error.name !== 'AbortError' ? error.message : 'Changement non confirmé. Rechargez avant de voter.', 'error');
    } finally {
      clearTimeout(timeout);
      if (changeController.current === controller) { changeController.current = null; setSavingMeter(false); }
    }
  };
  const moveSlide = (direction: number) => {
    if (!deck) return;
    const next = selection.slide + direction;
    if (next < 0 || next >= deck.slides.length) return;
    setSelection({ ...selection, slide: next });
    autoplayAnimations();
  };
  const playing = !paused && (wide || mobileVisible);

  return (
    <section ref={panelRef} className={`${card} flex min-h-0 min-w-0 flex-1 flex-col gap-2 rounded-2xl p-3 ${className}`} aria-labelledby="meter-title">
      <h2 id="meter-title" className="sr-only">Le baromètre d’humeur</h2>
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <label className="sr-only" htmlFor="meter-catalogue-select">Catalogue · {catalog.length} baromètres</label>
        <select id="meter-catalogue-select" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-slate-50/60 px-3 text-xs font-medium text-brand focus:bg-white disabled:opacity-75" disabled={!canChange} aria-describedby="daily-meter-note" value={String(selection.deck)} onChange={event => void selectDeck(Number(event.target.value))}>
          <option value="-1" disabled>{status === 'loading' ? 'Chargement…' : 'Choisissez un baromètre'}</option>
          <option value="-2">Baromètre original · choix manuel</option>
          {catalog.map((item, index) => <option key={index} value={index}>{displayTitle(item)}{state.usedMoodMeters?.includes(moodMeterId(item)) ? ' · Déjà utilisé' : ''}</option>)}
        </select>
        <button id="random-meter-button" type="button" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-lg text-brand hover:bg-blue-50" aria-label="Afficher un autre baromètre au hasard"
          title="Choisir un autre baromètre avant le premier vote" disabled={!canChange}
          onClick={() => void selectDeck(chooseUnusedDeck(catalog, state.usedMoodMeters ?? [], selection.deck))}>↝</button>
      </div>
      <p id="daily-meter-note" role="status" className="shrink-0 text-[11px] font-medium text-brand">{savingMeter ? 'Enregistrement du baromètre partagé…' : daily ? `Baromètre du ${daily.day} · Commun à toute l’équipe · ${hasVotes ? 'Verrouillé après le premier vote.' : 'Choisissez dans la liste avant le premier vote.'}` : status === 'error' ? 'Baromètre du jour indisponible. Rechargez pour réessayer ; aucun autre baromètre ne sera choisi.' : 'Chargement du baromètre du jour…'}</p>
      {stacked ? <div id="meter-slide-stack" className="grid min-h-0 flex-1 auto-rows-[minmax(0,1fr)] gap-2 overflow-hidden rounded-xl" aria-label="Toutes les diapositives du baromètre">
        {deck.slides.map((item, index) => <div key={`${selection.deck}:${index}:${retry}`} className="relative flex min-h-0 flex-col overflow-hidden rounded-[14px] motion-safe:animate-page-reveal">
          <MeterSlide slide={item} title={`${title} — diapositive ${index + 1}`} paused idPrefix={`meter-page-${index + 1}`} />
        </div>)}
      </div> : showSlide ? <MeterSlide key={`${selection.deck}:${selection.slide}:${retry}`} slide={slide}
        title={`${title} — diapositive ${selection.slide + 1}`} paused={!playing} /> : (
        <div key={`${selection.deck}:${pending}`} className={`${meterStage} motion-safe:animate-page-reveal`}>
          {pending ? <MoodMeterLoading /> : selection.deck === -2 ? <DefaultMoodMeter /> : <p className="p-4 text-center text-xs text-muted">Choisissez un baromètre dans la liste. Les baromètres déjà utilisés restent disponibles.</p>}
        </div>
      )}
      {!stacked && <div className="flex h-11 shrink-0 items-center justify-between gap-1 text-xs text-muted">
        <div className="flex min-w-0 items-center gap-1">
        <button id="meter-prev-button" type="button" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-brand hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Diapositive précédente" disabled={!deck || selection.slide === 0} onClick={() => moveSlide(-1)}>←</button>
        <span id="meter-slide-count" className="min-w-0 rounded-full bg-slate-100 px-2 py-1 text-center text-[11px] font-medium tabular-nums" aria-live="polite">{slide
          ? `${selection.slide + 1} / ${deck.slides.length}` : 'Aucune diapositive'}</span>
        <button id="meter-next-button" type="button" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-brand hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Diapositive suivante" disabled={!slide || selection.slide === deck.slides.length - 1} onClick={() => moveSlide(1)}>→</button>
        </div>
        <button id="meter-animation-button" type="button" disabled={!slide}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-line px-3 text-xs font-semibold text-brand hover:bg-blue-50 disabled:opacity-50" hidden={Boolean(deck?.remoteId)}
          aria-pressed={paused} aria-label={paused ? 'Lire les animations' : 'Mettre les animations en pause'}
          onClick={() => setPaused(value => !value)}>
          {paused ? '▶ Reprendre' : 'Ⅱ Stop'}</button>
      </div>}
      {deck?.remoteId && (!slide || conversion !== 'idle') && <div role="status" className="shrink-0 text-[11px] text-muted">
        {conversion === 'error' ? <>Présentation indisponible. Choisissez un autre baromètre ou <button type="button" className="min-h-11 px-2 text-brand underline" onClick={() => { setConversion('loading'); setRetry(value => value + 1); }}>Réessayer</button></> : 'Chargement des diapositives SVG depuis Google…'}
      </div>}
      <p id="meter-source-note" className={deck && !deck.remoteId ? 'sr-only' : 'shrink-0 text-[10px] text-muted'} role="status">{deck?.remoteId
        ? `${stacked ? `${deck.slides.length} diapositives affichées ensemble. ` : ''}SVG statiques fournis par Google ; GIF non animés.` : deck
        ? 'Les GIF jouent en boucle à l’ouverture de chaque diapositive. Stop fige les animations ; les flèches changent la diapositive.'
        : status === 'loading' ? 'Chargement du catalogue…'
        : status === 'error' ? 'Catalogue indisponible. Le baromètre original reste disponible dans la liste.'
        : selection.deck === -2 ? 'Baromètre original choisi manuellement.' : 'Sélection automatique parmi les baromètres non utilisés uniquement.'}</p>
    </section>
  );
}