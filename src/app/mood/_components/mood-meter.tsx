'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, IconButton, NativeSelect, Paper } from '@mui/material';
import {
  chooseUnusedDeck, displayTitle, groupMoodMeters, moodMeterId, isAnimatedImage, overlayCropStyle,
  overlayMatrix, type MoodMeterDeck, type MoodMeterSlide,
} from '../../../lib/mood/mood-meter';
import { loadMoodCatalog, loadMoodDeck } from '@/lib/mood/mood-catalog-client';
import { AnimatedImage } from './animated-image';
import { useTeam } from '@/providers/team-provider';
import { DefaultMoodMeter, MoodMeterLoading } from './default-mood-meter';
import { useNotify } from '@/providers/notification-provider';
import { MoodIcon } from './mood-icon';
import { MOOD_RETRY_DELAYS } from '@/lib/mood/mood-retry';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';

const slideError = 'Diapositive indisponible. Le baromètre par défaut est affiché.';
const meterStage = 'meter-stage relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-line bg-slate-50';
const backgroundImage = 'block h-full w-full object-contain';

// Slide-local state is isolated by a key so old image events cannot affect a
// newly selected deck/slide, even if the same URL occurs more than once.
export function MeterSlide({ slide, title, paused, idPrefix = 'meter', onSettled }: {
  slide: MoodMeterSlide;
  title: string;
  paused: boolean;
  idPrefix?: string;
  onSettled?: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(slide.aspectRatio ?? 16 / 9);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState<Set<number>>(() => new Set());
  const [snapshotWarning, setSnapshotWarning] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [waitingRetry, setWaitingRetry] = useState(false);
  const settled = useRef(onSettled);
  useEffect(() => { settled.current = onSettled; }, [onSettled]);
  const backgroundAnimated = isAnimatedImage(slide.image);

  const backgroundError = useCallback(() => {
    if (attempt < MOOD_RETRY_DELAYS.length) setWaitingRetry(true);
    else { setFailed(true); settled.current?.(); }
  }, [attempt]);

  useEffect(() => {
    if (!waitingRetry) return;
    const timer = setTimeout(() => { setWaitingRetry(false); setAttempt(value => value + 1); }, MOOD_RETRY_DELAYS[attempt]);
    return () => clearTimeout(timer);
  }, [waitingRetry, attempt]);

  useEffect(() => {
    if (!loading || failed || waitingRetry) return;
    const timeout = setTimeout(backgroundError, 45000);
    return () => clearTimeout(timeout);
  }, [loading, failed, waitingRetry, backgroundError]);

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
    settled.current?.();
    if (slide.aspectRatio === undefined && image.naturalHeight > 0) {
      setRatio(image.naturalWidth / image.naturalHeight || 16 / 9);
    }
  }, [slide.aspectRatio]);
  const snapshotError = useCallback(() => setSnapshotWarning(true), []);

  return (
    <div className={meterStage} ref={stageRef}>
      {failed ? <DefaultMoodMeter /> : loading ? <MoodMeterLoading /> : null}
      <div id={`${idPrefix}-slide-wrapper`} className="relative max-h-full max-w-full shrink-0 overflow-hidden" hidden={failed} style={{ width: size.width, height: size.height }}>
        {!waitingRetry && <AnimatedImage key={attempt} id={`${idPrefix}-slide`} className={backgroundImage} src={attempt ? `${slide.image}${slide.image.includes('?') ? '&' : '?'}retry=${attempt}` : slide.image} alt={title} paused={paused}
          animated={backgroundAnimated} fetchPriority="high" onLoad={loaded} onError={backgroundError}
          onSnapshotError={snapshotError} />}
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

function OrderedMeterSlides({ deck, title, retry }: { deck: MoodMeterDeck; title: string; retry: number }) {
  const [pinned, setPinned] = useState(false);
  const pages = deck.slides.slice(0, 2);
  return <div id="meter-slide-stack" className="group relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl [perspective:1200px]" aria-label="Diapositives du baromètre">
    <div id="meter-page-flip" className={`relative h-full w-full [transform-style:preserve-3d] transition-transform duration-1000 ease-[cubic-bezier(.22,.61,.36,1)] motion-reduce:transition-none ${pinned ? '[transform:rotateY(180deg)]' : '[transform:rotateY(0deg)] group-hover:[transform:rotateY(180deg)]'}`}>
      {pages.map((item, index) => <div id={`meter-page-${index + 1}-face`} key={`${index}:${retry}`} aria-hidden={index === 0 ? pinned : !pinned}
        className={`pointer-events-none absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[14px] [backface-visibility:hidden] ${index === 1 ? '[transform:rotateY(180deg)]' : ''}`}>
        <MeterSlide slide={item} title={`${title} — diapositive ${index + 1}`} paused idPrefix={`meter-page-${index + 1}`} />
      </div>)}
    </div>
    <span className="pointer-events-none absolute top-2 left-2 z-10 rounded-md bg-white/90 px-2.5 py-1.5 text-[10px] font-semibold text-ink shadow-sm">Survolez ou touchez la flèche pour retourner</span>
    {pages.length > 1 && <IconButton id="meter-flip-button" type="button" aria-label={pinned ? 'Afficher la diapositive 1' : 'Afficher la diapositive 2'} aria-pressed={pinned}
      title={pinned ? 'Revenir à la première diapositive' : 'Maintenir la deuxième diapositive affichée'}
      onClick={() => setPinned(value => !value)}
      sx={{ width: 44, height: 44 }} className="absolute right-1 bottom-1 z-10 rounded-full border border-line bg-white/95 text-brand shadow-sm">
      <MoodIcon name={pinned ? 'back' : 'arrow'} className="size-5" />
    </IconButton>}
  </div>;
}

export function MoodMeter({ className = '', mobileVisible = true, onShowPeople, locked = false }: { className?: string; mobileVisible?: boolean; onShowPeople?: () => void; locked?: boolean }) {
  const { state, updateTeam, activeTeamId, setDailyReady, cloudStatus } = useTeam();
  const notify = useNotify();
  const [savingMeter, setSavingMeter] = useState(false);
  const changeController = useRef<AbortController | null>(null);
  useEffect(() => () => changeController.current?.abort(), []);
  const initialUsed = useRef(state.usedMoodMeters ?? []);
  const initialHasVotes = useRef(state.roster.some(person => person.mood !== null));
  const initialSlide = useRef(state.currentMoodSlide);
  const panelRef = useRef<HTMLElement>(null);
  // GIF playback is explicitly requested; Stop remains available at all times.
  const [paused, setPaused] = useState(false);
  const [catalog, setCatalog] = useState<MoodMeterDeck[]>([]);
  const [selection, setSelection] = useState({ deck: -1, slide: 0 });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [wide, setWide] = useState(false);
  const [conversion, setConversion] = useState<'idle' | 'loading' | 'error'>('idle');
  const [retry, setRetry] = useState(0);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [daily, setDaily] = useState<{ day: string; meter: { meterId: string; title: string } } | null>(null);

  useEffect(() => {
    const query = matchMedia('(min-width: 801px)');
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!activeTeamId) return;
    const controller = new AbortController();
    setStatus('loading');
    setLoadError('');
    const timeout = setTimeout(() => { controller.abort(); setStatus('error'); }, 50000);
    let active = true;
    async function load() {
      try {
        const headers = { 'X-Team-Id': activeTeamId! };
        const [decks, response] = await Promise.all([
          loadMoodCatalog(controller.signal),
          fetch('/api/daily-meter', { headers, cache: 'no-store', signal: controller.signal }),
        ]);
        if (!active || controller.signal.aborted) return;
        if (!response.ok) throw new Error('daily meter');
        let assigned = await response.json();
        if (locked && !assigned.meter) throw new Error('Le baromètre sélectionné est indisponible. Réessayez sans en changer.');
        if (!locked && (!assigned.meter || !initialHasVotes.current)) {
          const previous = decks.findIndex(item => moodMeterId(item) === assigned.meter?.meterId);
          const candidate = chooseUnusedDeck(decks, initialUsed.current, previous);
          const meter = candidate >= 0 ? { meterId: moodMeterId(decks[candidate]), title: decks[candidate].title } : { meterId: 'original', title: 'Baromètre original' };
          // A locked daily choice wins if another device voted during loading.
          // Do not replace a valid choice with the original when unused decks run out.
          if (!assigned.meter || candidate >= 0) {
            const saved = await fetch('/api/daily-meter', { method: assigned.meter ? 'PATCH' : 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(meter), signal: controller.signal });
            if (saved.status === 409) {
              const current = await fetch('/api/daily-meter', { headers, cache: 'no-store', signal: controller.signal });
              if (!current.ok) throw new Error('daily meter reload');
              assigned = await current.json();
            } else {
              if (!saved.ok) throw new Error('daily meter save');
              assigned = await saved.json();
            }
          }
        }
        if (!active || controller.signal.aborted) return;
        if (!assigned.meter) throw new Error('missing daily meter');
        const selected = assigned.meter.meterId === 'original' ? -2 : decks.findIndex(item => moodMeterId(item) === assigned.meter.meterId);
        if (selected === -1) throw new Error('daily meter unavailable');
        setDaily(assigned);
        setCatalog(decks);
        setSelection({ deck: selected, slide: initialSlide.current?.meterId === assigned.meter.meterId ? Math.max(0, (initialSlide.current?.slideNumber ?? 1) - 1) : 0 });
        if (decks[selected]?.remoteId) setConversion('loading');
        setStatus('ready');
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : 'Catalogue indisponible.');
          setStatus('error');
        }
      } finally {
        clearTimeout(timeout);
      }
    }
    void load();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [activeTeamId, catalogRetry, locked]);

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
    if (locked && !usable) return;
    updateTeam(current => ({ ...current, currentMoodSlide: showSlide ? { title, image: slide.image, slideNumber: selection.slide + 1, meterId: moodMeterId(deck) } : null }));
    // Keep today's assigned slide available for late votes on the timer route.
    // The provider resets readiness when changing teams.
  }, [slide, showSlide, title, selection.slide, selection.deck, deck, updateTeam, daily, savingMeter, setDailyReady, locked]);
  const autoplayAnimations = () => {
    setPaused(false);
  };
  const hasVotes = state.roster.some(person => person.mood !== null);
  const canChange = Boolean(!locked && daily && !hasVotes && !savingMeter && status === 'ready' && cloudStatus === 'saved');
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
    <Paper component="section" elevation={0} ref={panelRef} className={`flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden rounded-lg border border-line border-t-2 border-t-accent bg-white p-4 max-[650px]:p-3 [@media(max-height:650px)]:gap-1 [@media(max-height:650px)]:p-2.5 ${className}`} aria-labelledby="meter-title">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0"><h2 id="meter-title" className="truncate text-base font-bold text-ink max-[800px]:sr-only">Baromètre du jour</h2></div>
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <div className={`flex min-w-0 flex-1 items-center gap-2 ${locked ? 'max-[800px]:sr-only' : ''}`}>
        <label className="sr-only" htmlFor="meter-catalogue-select">Catalogue · {catalog.length} baromètres</label>
        <NativeSelect disableUnderline inputProps={{ id: 'meter-catalogue-select', 'aria-describedby': 'daily-meter-note' }} sx={{ height: 44, minWidth: 0, fontSize: 12, '& select': { boxSizing: 'border-box', height: 44, pl: 1.5, pr: 4 } }} className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/70 text-xs font-semibold text-brand focus-within:border-brand/40 focus-within:ring-2 focus-within:ring-brand/10 disabled:opacity-75" disabled={!canChange} value={String(selection.deck)} onChange={event => void selectDeck(Number(event.target.value))}>
          <option value="-1" disabled>{status === 'loading' ? 'Chargement…' : 'Choisissez un baromètre'}</option>
          <option value="-2">Baromètre original · choix manuel</option>
          {groupMoodMeters(catalog).map(({ label, entries }) => <optgroup key={label} label={`${label} (${entries.length})`}>
            {entries.map(({ deck: item, index }) => <option key={moodMeterId(item)} value={index}>{displayTitle(item)}{state.usedMoodMeters?.includes(moodMeterId(item)) ? ' · Déjà utilisé' : ''}</option>)}
          </optgroup>)}
        </NativeSelect>
        <IconButton size="small" sx={{ width: 44, height: 44 }} id="random-meter-button" type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-brand hover:border-brand/30 hover:bg-blue-50" aria-label="Afficher un autre baromètre au hasard"
          title="Choisir un autre baromètre avant le premier vote" disabled={!canChange}
          onClick={() => void selectDeck(chooseUnusedDeck(catalog, state.usedMoodMeters ?? [], selection.deck))}><MoodIcon name="shuffle" className="size-5" /></IconButton>
        </div>
      </div>
      <p id="daily-meter-note" role="status" className={`flex shrink-0 items-start gap-2 rounded-lg px-2 py-1 text-xs leading-snug ${locked && status === 'ready' ? 'max-[800px]:sr-only' : ''} ${status === 'error' ? 'bg-danger-soft text-danger' : savingMeter || !daily ? 'text-amber-800' : 'text-muted'}`}><MoodIcon name={hasVotes ? 'lock' : 'meter'} className="mt-0.5 size-3.5 shrink-0" /><span>{savingMeter ? 'Enregistrement du baromètre…' : daily ? hasVotes ? 'Verrouillé après le premier vote.' : 'Modifiable avant le premier vote.' : status === 'error' ? 'Baromètre du jour indisponible. Rechargez pour réessayer ; aucun autre baromètre ne sera choisi.' : 'Chargement du baromètre du jour…'}</span></p>
      {stacked ? <OrderedMeterSlides key={`${deck.remoteId}:${retry}`} deck={deck} title={title} retry={retry} /> : showSlide ? <MeterSlide key={`${selection.deck}:${selection.slide}:${retry}`} slide={slide}
        title={`${title} — diapositive ${selection.slide + 1}`} paused={!playing} /> : (
        <div key={`${selection.deck}:${pending}`} className={`${meterStage} motion-safe:animate-page-reveal`}>
          {pending ? <MoodMeterLoading /> : selection.deck === -2 ? <DefaultMoodMeter /> : <p className="p-4 text-center text-xs text-muted">Choisissez un baromètre dans la liste. Les baromètres déjà utilisés restent disponibles.</p>}
        </div>
      )}
      {!stacked && deck && <div className="flex h-11 shrink-0 items-center justify-between gap-1 text-xs text-muted">
        <div className="flex min-w-0 items-center gap-1">
        <IconButton size="small" sx={{ width: 44, height: 44 }} id="meter-prev-button" type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-brand hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Diapositive précédente" disabled={!deck || selection.slide === 0} onClick={() => moveSlide(-1)}><MoodIcon name="back" /></IconButton>
        <span id="meter-slide-count" className="min-w-0 rounded-full bg-slate-100 px-2 py-1 text-center text-[11px] font-medium tabular-nums" aria-live="polite">{slide
          ? `${selection.slide + 1} / ${deck.slides.length}` : 'Aucune diapositive'}</span>
        <IconButton size="small" sx={{ width: 44, height: 44 }} id="meter-next-button" type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-brand hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Diapositive suivante" disabled={!slide || selection.slide === deck.slides.length - 1} onClick={() => moveSlide(1)}><MoodIcon name="arrow" /></IconButton>
        </div>
        <Button disableElevation size="small" variant="outlined" sx={{ minHeight: 44, minWidth: 0, textTransform: 'none', fontSize: 12, '&[hidden]': { display: 'none' } }} id="meter-animation-button" type="button" disabled={!slide}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-line px-3 text-xs font-semibold text-brand hover:bg-blue-50 disabled:opacity-50" hidden={Boolean(deck?.remoteId)}
          aria-pressed={paused} aria-label={paused ? 'Lire les animations' : 'Mettre les animations en pause'}
          onClick={() => setPaused(value => !value)}>
          {paused ? <PlayArrowRounded className="size-4" /> : <PauseRounded className="size-4" />}{paused ? 'Reprendre' : 'Stop'}</Button>
      </div>}
      {deck?.remoteId && (!slide || conversion !== 'idle') && <div role="status" className="shrink-0 text-[11px] text-muted">
        {conversion === 'error' ? <>Présentation indisponible. Choisissez un autre baromètre ou <Button disableElevation size="small" variant="text" sx={{ minHeight: 44, minWidth: 0, textTransform: 'none', fontSize: 11 }} type="button" className="min-h-11 px-2 text-brand underline" onClick={() => { setConversion('loading'); setRetry(value => value + 1); }}>Réessayer</Button></> : 'Chargement des diapositives SVG depuis Google…'}
      </div>}
      <p id="meter-source-note" className={deck && !deck.remoteId ? 'sr-only' : `shrink-0 text-[10px] text-muted ${status === 'ready' ? '[@media(max-height:650px)]:sr-only' : ''}`} role="status">{deck?.remoteId
        ? `${stacked ? `${deck.slides.length} diapositives disponibles. ` : ''}SVG statiques fournis par Google ; GIF non animés.` : deck
        ? 'Les GIF jouent en boucle à l’ouverture de chaque diapositive. Stop fige les animations ; les flèches changent la diapositive.'
        : status === 'loading' ? 'Chargement du catalogue…'
        : status === 'error' ? loadError || 'Catalogue indisponible. Réessayez le chargement.'
        : selection.deck === -2 ? 'Baromètre original choisi manuellement.' : 'Sélection automatique parmi les baromètres non utilisés uniquement.'}</p>
      {status === 'error' && <Button type="button" variant="outlined" sx={{ minHeight: 44, flexShrink: 0 }} onClick={() => setCatalogRetry(value => value + 1)}>Réessayer le catalogue</Button>}
      {onShowPeople && <button type="button" onClick={onShowPeople} className="group hidden min-h-11 shrink-0 items-center justify-center gap-3 rounded-xl bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-dark max-[800px]:inline-flex [@media(max-height:650px)]:hidden">Renseigner les humeurs<MoodIcon name="arrow" className="size-4 shrink-0 motion-safe:transition-transform motion-safe:group-hover:translate-x-1" /></button>}
    </Paper>
  );
}