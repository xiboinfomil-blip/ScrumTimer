'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
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
  return <p data-mood-title className="break-words text-xl font-bold leading-tight" aria-live="polite">{title ?? fallback}</p>;
}

const moodDetails = [
  null,
  { title: 'Mauvaise humeur', tone: 'border-red-200 bg-red-50 text-red-900' },
  { title: 'Mauvaise humeur', tone: 'border-amber-200 bg-amber-50 text-amber-950' },
  { title: 'Bonne humeur', tone: 'border-blue-200 bg-blue-50 text-blue-900' },
  { title: 'Bonne humeur', tone: 'border-green-200 bg-green-50 text-green-900' },
] as const;
const faces = ['😣', '😞', '😌', '😊'];

export function CurrentMoodCard({ timer, compact = false }: { timer: StandupTimer; compact?: boolean }) {
  const reduced = useReducedMotion();
  const person = timer.person;
  const mood = person?.mood ?? null;
  const detail = mood ? moodDetails[mood] : null;
  const label = person ? `Humeur de ${person.name} : ${mood ?? 'non renseignée'}${mood ? ' sur 4' : ''}` : 'Aucun passage en cours';

  return <Paper component="section" elevation={0} aria-label={label} data-testid="current-speaker-mood" className={`min-w-0 overflow-hidden rounded-lg border bg-white ${detail?.tone ?? 'border-line'}`}>
    <div className="flex items-center justify-between gap-3 border-b border-current/10 px-3 py-2">
      <h2 className="flex items-center gap-2 text-sm font-bold"><MoodRounded fontSize="small" /> Humeur actuelle</h2>
    </div>
    {person && mood && detail ? <motion.div key={`${person.id}:${mood}`} initial={reduced ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : .4, ease: [.22, 1, .36, 1] }} id="speaker-mood" role="group" aria-label={`Humeur de ${person.name} : ${mood} sur 4`} className="flex min-w-0 items-center gap-3 p-3">
      <div className={`relative grid ${compact ? 'size-20' : 'size-24'} text-4xl shrink-0 place-items-center overflow-hidden rounded-lg border border-current/15 bg-white`} aria-hidden="true">
        <span>{faces[mood - 1]}</span>
        {person.moodSlide && <SpeakerMoodPicture key={`${person.id}:${person.moodSlide.image}:${mood}`} context={person.moodSlide} mood={mood} card />}
      </div>
      <div className="min-w-0 flex-1">
        <MoodTitle key={`${person.id}:${person.moodSlide?.image}:${mood}`} context={person.moodSlide} mood={mood} fallback={detail.title} />
        <ol aria-label="Échelle d’humeur" className="mt-3 grid grid-cols-4 gap-1.5">
          {([1, 2, 3, 4] as const).map(value => <li key={value} aria-current={value === mood ? 'true' : undefined} className="min-w-0"><span className={`grid h-8 min-w-0 place-items-center rounded-md border text-sm font-bold tabular-nums ${value === mood ? 'border-brand bg-brand text-white motion-safe:scale-[1.06]' : 'border-current/15 bg-white/80 text-muted'}`}>{value}<span className="sr-only">{value === mood ? ' : humeur sélectionnée' : ''}</span></span></li>)}
        </ol>
      </div>
      <div role="img" aria-label={`Niveau ${mood} sur 4`} className="sr-only">{mood}</div>
    </motion.div> : <div className={`flex items-center gap-3 ${compact ? 'p-2' : 'min-h-[92px] p-3'}`}>
      <span className="grid size-12 shrink-0 place-items-center rounded-md bg-slate-50 text-muted"><MoodRounded /></span>
      <p className="text-xs leading-relaxed text-muted">{person ? 'Aucune humeur renseignée pour ce passage.' : 'La prochaine humeur apparaîtra avec la personne qui prend la parole.'}</p>
    </div>}
  </Paper>;
}