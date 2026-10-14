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
  const { state, updateTeam } = useTeam();
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
        setCatalog(decks);
        const selected = chooseUnusedDeck(decks, initialUsed.current);
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
  }, []);

  const deck = catalog[selection.deck];
  const slide = deck?.slides[selection.slide];
  const title = deck ? displayTitle(deck) : 'Baromètre original';
  const pending = status === 'loading' || conversion === 'loading';
  const showSlide = slide && !pending && conversion !== 'error';
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
    updateTeam(current => ({ ...current, currentMoodSlide: showSlide ? { title, image: slide.image, slideNumber: selection.slide + 1, meterId: moodMeterId(deck) } : null }));
  }, [slide, showSlide, title, selection.slide, deck, updateTeam]);
  const autoplayAnimations = () => {
    setPaused(false);
  };
  const selectDeck = (index: number) => {
    if (index === -2) { setSelection({ deck: -2, slide: 0 }); setConversion('idle'); return; }
    if (!Number.isInteger(index) || !catalog[index]) return;
    setConversion(catalog[index].remoteId ? 'loading' : 'idle');
    if (index === selection.deck) setRetry(value => value + 1);
    setSelection({ deck: index, slide: 0 });
    autoplayAnimations();
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
        <select id="meter-catalogue-select" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-slate-50/60 px-3 text-xs font-medium text-brand focus:bg-white disabled:opacity-50" disabled={status === 'loading'} value={String(selection.deck)} onChange={event => selectDeck(Number(event.target.value))}>
          <option value="-1" disabled>{status === 'loading' ? 'Chargement…' : 'Choisissez un baromètre'}</option>
          <option value="-2">Baromètre original · choix manuel</option>
          {catalog.map((item, index) => <option key={index} value={index}>{displayTitle(item)}{state.usedMoodMeters?.includes(moodMeterId(item)) ? ' · Déjà utilisé' : ''}</option>)}
        </select>
        <button id="random-meter-button" type="button" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-lg text-brand hover:bg-blue-50" aria-label="Afficher un autre baromètre au hasard"
          title="Afficher un baromètre non utilisé au hasard" disabled={!catalog.some((item, index) => index !== selection.deck && !state.usedMoodMeters?.includes(moodMeterId(item)))}
          onClick={() => selectDeck(chooseUnusedDeck(catalog, state.usedMoodMeters ?? [], selection.deck))}>↝</button>
      </div>
      {showSlide ? <MeterSlide key={`${selection.deck}:${selection.slide}:${retry}`} slide={slide}
        title={`${title} — diapositive ${selection.slide + 1}`} paused={!playing} /> : (
        <div className={meterStage}>
          {pending ? <MoodMeterLoading /> : selection.deck === -2 ? <DefaultMoodMeter /> : <p className="p-4 text-center text-xs text-muted">Choisissez un baromètre dans la liste. Les baromètres déjà utilisés restent disponibles.</p>}
        </div>
      )}
      <div className="flex h-11 shrink-0 items-center justify-between gap-1 text-xs text-muted">
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
      </div>
      {deck?.remoteId && (!slide || conversion !== 'idle') && <div role="status" className="shrink-0 text-[11px] text-muted">
        {conversion === 'error' ? <>Présentation indisponible. Choisissez un autre baromètre ou <button type="button" className="min-h-11 px-2 text-brand underline" onClick={() => { setConversion('loading'); setRetry(value => value + 1); }}>Réessayer</button></> : 'Chargement des diapositives SVG depuis Google…'}
      </div>}
      <p id="meter-source-note" className={deck && !deck.remoteId ? 'sr-only' : 'shrink-0 text-[10px] text-muted'} role="status">{deck?.remoteId
        ? 'SVG fourni à la demande par Google. Image statique : les GIF ne sont pas animés.' : deck
        ? 'Les GIF jouent en boucle à l’ouverture de chaque diapositive. Stop fige les animations ; les flèches changent la diapositive.'
        : status === 'loading' ? 'Chargement du catalogue…'
        : status === 'error' ? 'Catalogue indisponible. Le baromètre original reste disponible dans la liste.'
        : selection.deck === -2 ? 'Baromètre original choisi manuellement.' : 'Sélection automatique parmi les baromètres non utilisés uniquement.'}</p>
    </section>
  );
}