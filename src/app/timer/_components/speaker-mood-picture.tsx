'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { loadMoodCatalog, loadMoodDeck } from '@/lib/mood/mood-catalog-client';
import { extractMoodPictures, gifPlaybackDuration, selectMoodPicture } from '@/lib/mood/mood-picture';
import type { Mood, MoodSlideContext } from '@/types/team';
import { AnimatedImage } from '@/app/mood/_components/animated-image';

const cache = new Map<string, (string | null)[]>();

export function SpeakerMoodPicture({ context, mood }: { context: MoodSlideContext; mood: Mood }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [playbackDuration, setPlaybackDuration] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    async function load() {
      const catalog = await loadMoodCatalog(controller.signal);
      const deck = catalog.find(item => item.remoteId
        ? context.image.startsWith(`/mood-meters/slides/${item.remoteId}/`)
        : item.slides.some(slide => slide.image === context.image));
      if (!deck) return;
      const first = (await loadMoodDeck(deck, controller.signal)).slides[0];
      if (!first) return;
      let pictures = cache.get(first.image);
      if (!pictures) {
        if (/\.svg$/i.test(first.image)) {
          const response = await fetch(first.image, { signal: controller.signal });
          if (!response.ok) return;
          const svg = await response.text();
          if (svg.length > 20 * 1024 * 1024) return;
          pictures = extractMoodPictures(svg);
        } else {
          pictures = ([1, 2, 3, 4] as const).map(value => selectMoodPicture(first.overlays.map(overlay => ({
            src: overlay.src, x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height,
          })), value));
        }
        controller.signal.throwIfAborted();
        if (cache.size >= 4) cache.delete(cache.keys().next().value!);
        cache.set(first.image, pictures);
      }
      const selected = pictures[mood - 1];
      const animated = Boolean(selected && (/^data:image\/gif;/i.test(selected) || /\.gif$/i.test(selected)));
      let duration: number | null = null;
      if (animated && selected) {
        const response = await fetch(selected, { signal: controller.signal });
        if (!response.ok) return;
        duration = gifPlaybackDuration(new Uint8Array(await response.arrayBuffer()));
      }
      if (!controller.signal.aborted) {
        setPlaybackDuration(duration);
        setPaused(Boolean(reduced) || (animated && duration === null));
        setSrc(selected);
      }
    }
    load().catch(() => {}).finally(() => clearTimeout(timeout));
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [context.image, mood, reduced]);
  useEffect(() => {
    if (reduced) setPaused(true);
  }, [reduced]);
  useEffect(() => {
    if (!src || !playbackDuration || paused) return;
    const timeout = setTimeout(() => setPaused(true), playbackDuration);
    return () => clearTimeout(timeout);
  }, [src, playbackDuration, paused]);
  if (!src || failed) return null;
  return <div className="pointer-events-none relative size-[clamp(28px,10cqw,42px)] shrink-0 overflow-hidden rounded-md border border-white/50 bg-white" data-mood-picture={mood} aria-hidden="true">
    <AnimatedImage src={src} alt="" animated={/^data:image\/gif;/i.test(src) || /\.gif$/i.test(src)} paused={paused} className="absolute inset-0 size-full object-cover" onError={() => setFailed(true)} />
  </div>;
}