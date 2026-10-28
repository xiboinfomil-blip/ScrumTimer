'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { loadMoodCatalog, loadMoodDeck } from '@/lib/mood/mood-catalog-client';
import { extractMoodPictures, selectMoodPicture, slowMoodGif } from '@/lib/mood/mood-picture';
import type { Mood, MoodSlideContext } from '@/types/team';
import { AnimatedImage } from '@/app/mood/_components/animated-image';

const cache = new Map<string, (string | null)[]>();

export function SpeakerMoodPicture({ context, mood }: { context: MoodSlideContext; mood: Mood }) {
  const [src, setSrc] = useState<string | null>(null);
  const [animated, setAnimated] = useState(false);
  const [failed, setFailed] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
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
      const isGif = Boolean(selected && (/^data:image\/gif;/i.test(selected) || /\.gif$/i.test(selected)));
      let playable = selected;
      if (selected && isGif) {
        const response = await fetch(selected, { signal: controller.signal });
        if (!response.ok) return;
        const bytes = new Uint8Array(await response.arrayBuffer());
        controller.signal.throwIfAborted();
        objectUrl = URL.createObjectURL(new Blob([Uint8Array.from(slowMoodGif(bytes))], { type: 'image/gif' }));
        playable = objectUrl;
      }
      if (!controller.signal.aborted) { setAnimated(isGif); setSrc(playable); }
    }
    load().catch(() => {}).finally(() => clearTimeout(timeout));
    return () => { controller.abort(); clearTimeout(timeout); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [context.image, mood]);
  if (!src || failed) return null;
  return <div className="pointer-events-none absolute inset-[6%] overflow-hidden rounded-full bg-white" data-mood-picture={mood} aria-hidden="true">
    <AnimatedImage src={src} alt="" animated={animated} paused={Boolean(reduced)} className="absolute inset-0 size-full object-cover" onError={() => setFailed(true)} />
  </div>;
}