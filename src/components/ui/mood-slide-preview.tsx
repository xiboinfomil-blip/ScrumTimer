'use client';

import { useEffect, useState } from 'react';
import { Button } from '@mui/material';
import { useReducedMotion } from 'framer-motion';
import { loadMoodCatalog, loadMoodDeck } from '@/lib/mood/mood-catalog-client';
import type { MoodMeterSlide } from '@/lib/mood/mood-meter';
import type { MoodSlideContext } from '@/types/team';
import { MeterSlide } from '@/app/mood/_components/mood-meter';

export function MoodSlidePreview({ context, idPrefix, compact = false }: { context: MoodSlideContext; idPrefix: string; compact?: boolean }) {
  const [slide, setSlide] = useState<MoodMeterSlide>({ image: context.image, overlays: [] });
  const [playing, setPlaying] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    const controller = new AbortController();
    loadMoodCatalog(controller.signal).then(async catalog => {
      const deck = catalog.find(item => item.remoteId ? context.image.startsWith(`/mood-meters/slides/${item.remoteId}/`) : item.slides.some(candidate => candidate.image === context.image));
      if (!deck) return;
      const loaded = await loadMoodDeck(deck, controller.signal);
      const exact = loaded.slides.find(candidate => candidate.image === context.image);
      if (exact && !controller.signal.aborted) setSlide(exact);
    }).catch(() => { /* The saved exact image remains usable without catalogue metadata. */ });
    return () => controller.abort();
  }, [context.image]);
  const animated = slide.overlays.length > 0 || /\.gif$/i.test(slide.image);
  return <figure className={compact ? 'flex min-h-12 flex-1 flex-col overflow-hidden' : 'mt-3'}>
    <div className={compact ? 'flex min-h-0 flex-1 flex-col' : 'flex h-52 min-w-0 flex-col sm:h-64'}><MeterSlide key={context.image} slide={slide} title={`${context.title} — diapositive ${context.slideNumber}`} paused={!playing || Boolean(reduced)} idPrefix={idPrefix} /></div>
    <figcaption className={`${compact ? 'shrink-0' : 'mt-2'} flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted`}><span className={compact ? 'sr-only' : ''}>Diapositive {context.slideNumber} · image associée au choix enregistré</span>{animated && <Button disabled={Boolean(reduced)} sx={{ minHeight: 44, fontSize: 11 }} aria-pressed={playing && !reduced} onClick={() => setPlaying(value => !value)}>{reduced ? 'Animations réduites' : playing ? 'Stop' : 'Lire les GIF'}</Button>}</figcaption>
  </figure>;
}