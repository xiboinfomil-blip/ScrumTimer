'use client';

import { useEffect, useState } from 'react';
import { Paper } from '@mui/material';
import MoodRounded from '@mui/icons-material/MoodRounded';
import type { StandupTimer } from './timer-page';
import { SpeakerMoodPicture } from './speaker-mood-picture';
import { loadMoodCatalog } from '@/lib/mood/mood-catalog-client';
import type { Mood, MoodSlideContext } from '@/types/team';

const titlesCache = new Map<string, (string | null)[]>();

function MoodTitle({ context, mood, fallback }: { context?: MoodSlideContext | null; mood: Mood; fallback: string }) {
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    if (!context) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    async function load() {
      const catalog = await loadMoodCatalog(controller.signal);
      const deck = catalog.find(item => item.remoteId && context!.image.startsWith(`/mood-meters/slides/${item.remoteId}/`));
      if (!deck?.remoteId) return;
      let titles = titlesCache.get(deck.remoteId);
      if (!titles) {
        const response = await fetch(`/api/mood-meters/decks/${deck.remoteId}/titles`, { signal: controller.signal });
        if (!response.ok) return;
        const value: unknown = (await response.json()).titles;
        if (!Array.isArray(value) || value.length !== 4 || !value.every(item => item === null || typeof item === 'string' && item.length <= 120)) return;
        titles = value;
        if (titlesCache.size >= 20) titlesCache.delete(titlesCache.keys().next().value!);
        titlesCache.set(deck.remoteId, titles);
      }
      if (!controller.signal.aborted) setTitle(titles[mood - 1]);
    }
    load().catch(() => {}).finally(() => clearTimeout(timeout));
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [context, mood]);
  return <p data-mood-title className="mt-1 break-words text-xl font-bold leading-snug" aria-live="polite">{title ?? fallback}</p>;
}

const moodDetails = [
  null,
  { title: 'Mauvaise humeur', energy: 'Énergie élevée', tone: 'border-red-200 bg-red-50 text-red-900', dot: 'bg-red-600' },
  { title: 'Mauvaise humeur', energy: 'Énergie basse', tone: 'border-amber-200 bg-amber-50 text-amber-950', dot: 'bg-amber-600' },
  { title: 'Bonne humeur', energy: 'Énergie basse', tone: 'border-blue-200 bg-blue-50 text-blue-900', dot: 'bg-blue-600' },
  { title: 'Bonne humeur', energy: 'Énergie élevée', tone: 'border-green-200 bg-green-50 text-green-900', dot: 'bg-green-600' },
] as const;
const faces = ['😣', '😞', '😌', '😊'];

export function CurrentMoodCard({ timer, compact = false }: { timer: StandupTimer; compact?: boolean }) {
  const person = timer.person;
  const mood = person?.mood ?? null;
  const detail = mood ? moodDetails[mood] : null;
  const label = person ? `Humeur de ${person.name} : ${mood ?? 'non renseignée'}${mood ? ' sur 4' : ''}` : 'Aucun passage en cours';

  return <Paper component="section" elevation={0} aria-label={label} data-testid="current-speaker-mood" className={`min-w-0 overflow-hidden rounded-lg border bg-white ${detail?.tone ?? 'border-line'}`}>
    <div className={`flex items-center justify-between gap-2 border-b border-current/10 px-3 ${compact ? 'py-1.5' : 'py-2'}`}>
      <h2 className="flex items-center gap-2 text-sm font-bold"><MoodRounded className="size-4" /> Humeur actuelle</h2>
      {mood && <span className="rounded bg-white/80 px-2 py-1 text-xs font-bold tabular-nums">{mood} / 4</span>}
    </div>
    {person && mood && detail ? <div id="speaker-mood" role="group" aria-label={`Humeur de ${person.name} : ${mood} sur 4`} className={`flex min-w-0 items-center ${compact ? 'gap-2 p-2' : 'gap-3 p-3'}`}>
      <div className={`relative grid ${compact ? 'size-11 text-xl' : 'size-[60px] text-2xl'} shrink-0 place-items-center overflow-hidden rounded-md border border-current/10 bg-white`} aria-hidden="true">
        <span>{faces[mood - 1]}</span>
        {person.moodSlide && <SpeakerMoodPicture key={`${person.id}:${person.moodSlide.image}:${mood}`} context={person.moodSlide} mood={mood} card />}
        <span className="absolute right-1 top-1 z-10 grid size-5 place-items-center rounded bg-white/95 text-[10px] font-black tabular-nums text-ink shadow-sm">{mood}</span>
      </div>
      <div className="min-w-0 flex-1">
        <MoodTitle key={`${person.id}:${person.moodSlide?.image}:${mood}`} context={person.moodSlide} mood={mood} fallback={detail.title} />
        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium"><span className={`size-1.5 rounded-full ${detail.dot}`} aria-hidden="true" />{detail.energy}</p>
      </div>
      <div role="img" aria-label={`Niveau ${mood} sur 4`} className="sr-only">{mood}</div>
    </div> : <div className={`flex items-center gap-3 ${compact ? 'p-2' : 'min-h-[92px] p-3'}`}>
      <span className="grid size-12 shrink-0 place-items-center rounded-md bg-slate-50 text-muted"><MoodRounded /></span>
      <p className="text-xs leading-relaxed text-muted">{person ? 'Aucune humeur renseignée pour ce passage.' : 'La prochaine humeur apparaîtra avec la personne qui prend la parole.'}</p>
    </div>}
    {person && mood && <div className={`grid grid-cols-4 gap-1 px-3 ${compact ? 'pb-2' : 'pb-3'}`} role="group" aria-label="Échelle d’humeur">
      {moodDetails.slice(1).map((item, index) => <span key={index} aria-label={`Humeur ${index + 1}${mood === index + 1 ? ', sélectionnée' : ''}`} className={`h-1.5 rounded-full ${mood === index + 1 ? item?.dot : 'bg-current/10'}`} />)}
    </div>}
  </Paper>;
}