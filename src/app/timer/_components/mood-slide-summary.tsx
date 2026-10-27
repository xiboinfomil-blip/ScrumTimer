'use client';

import { useEffect, useState } from 'react';
import { Loader } from '@infomil/scrum-shared/ui';
import { Button, Paper } from '@mui/material';
import { type MoodMeterSlide } from '@/lib/mood-meter';
import { loadMoodCatalog, loadMoodDeck } from '@/lib/mood-catalog-client';
import type { SessionSpeaker } from '@/lib/session-results';
import { MeterSlide } from '../../mood/_components/mood-meter';

export function MoodSlideSummary({ people }: { people: SessionSpeaker[] }) {
  const [slides, setSlides] = useState<Map<string, MoodMeterSlide>>(new Map());
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const contexts = [...new Map(people.flatMap(person => person.moodSlide ? [[person.moodSlide.image, person.moodSlide] as const] : [])).values()];
  const contextKey = JSON.stringify(contexts.map(context => context.image).sort());
  useEffect(() => {
    const controller = new AbortController();
    const images: string[] = JSON.parse(contextKey);
    loadMoodCatalog(controller.signal).then(async catalog => {
      const relevant = catalog.filter(deck => !deck.remoteId || images.some(image => image.startsWith(`/mood-meters/slides/${deck.remoteId}/`)));
      for (const deck of relevant) {
        try {
          const loaded = await loadMoodDeck(deck, controller.signal);
          if (!controller.signal.aborted) setSlides(previous => new Map([...previous, ...loaded.slides.map(slide => [slide.image, slide] as const)]));
        } catch { if (!controller.signal.aborted) setError(true); }
      }
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [contextKey]);
  if (!contexts.length) return <p className="text-[10px] text-muted">Diapositive non enregistrée pour ces humeurs. Choisissez à nouveau une humeur pour associer son baromètre.</p>;
  return <div id="used-mood-slides" className="space-y-3">
    <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold">Baromètres utilisés</h3>{[...slides.values()].some(slide => slide.overlays.length > 0 || /\.gif$/i.test(slide.image)) && <Button disableElevation size="small" variant="text" sx={{ minHeight: 44, minWidth: 0, textTransform: 'none', fontSize: 11 }} type="button" className="min-h-11 rounded-lg px-2 text-[11px] text-brand hover:bg-blue-50" aria-pressed={playing} onClick={() => setPlaying(value => !value)}>{playing ? 'Stop' : 'Lire les GIF'}</Button>}</div>
    {contexts.map((context, index) => {
      const peopleForSlide = people.filter(person => person.moodSlide?.image === context.image);
      const slide = slides.get(context.image);
      return <Paper component="article" elevation={0} sx={{ borderRadius: 2 }} key={context.image} className="rounded-lg border border-line p-2"><h4 className="truncate text-xs font-medium" title={context.title}>{context.title} · Diapositive {context.slideNumber}</h4>
        <div className="mt-2 flex h-40 min-w-0 flex-col">{slide ? <MeterSlide idPrefix={`result-meter-${index}`} slide={slide} title={`${context.title} — diapositive ${context.slideNumber}`} paused={!playing} /> : <div className="grid h-full place-items-center bg-slate-50">{error || slides.size ? <p role="status" className="text-[11px] text-muted">Aperçu indisponible.</p> : <Loader size="sm" label="Chargement du baromètre…" />}</div>}</div>
        <ul className="mt-2 space-y-1 text-[10px] text-muted">{peopleForSlide.map(person => <li key={person.id}><span className="font-medium text-ink">{person.name}</span> · Humeur {person.mood}</li>)}</ul>
      </Paper>;
    })}
    <p className="text-[10px] text-muted">Les nombres renvoient à ces images. Des baromètres différents peuvent donner un sens différent au même nombre.</p>
  </div>;
}