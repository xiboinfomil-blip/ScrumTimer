'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { Smile as MoodRounded } from 'lucide-react';
import type { StandupTimer } from './timer-page';
import { SpeakerMoodPicture } from './speaker-mood-picture';
import { loadMoodCatalog, loadMoodTitles } from '@/lib/mood/mood-catalog-client';
import type { Mood, MoodSlideContext } from '@/types/team';

function MoodTitle({ context, mood, fallback }: { context?: MoodSlideContext | null; mood: Mood; fallback: string }) {
  const [text, setText] = useState<{ title: string | null; subtitle: string | null }>({ title: null, subtitle: null });
  useEffect(() => {
    if (!context) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    async function load() {
      const catalog = await loadMoodCatalog(controller.signal);
      const deck = catalog.find(item => item.remoteId && context!.image.startsWith(`/mood-meters/slides/${item.remoteId}/`));
      if (!deck?.remoteId) return;
      const texts = await loadMoodTitles(deck.remoteId, controller.signal);
      if (!controller.signal.aborted) setText({ title: texts.titles[mood - 1], subtitle: texts.subtitles[mood - 1] });
    }
    load().catch(() => {}).finally(() => clearTimeout(timeout));
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [context, mood]);
  return <div className="min-w-0 text-left">
    <p data-mood-title className="break-words text-base font-bold leading-tight" aria-live="polite">{text.title ?? fallback}</p>
    {text.subtitle && <p data-mood-subtitle className="mt-1 break-words text-xs leading-relaxed text-muted">{text.subtitle}</p>}
  </div>;
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

  return <section aria-label={label} data-testid="current-speaker-mood" className={`min-w-0 overflow-hidden rounded-lg border bg-white ${detail?.tone ?? 'border-line'}`}>
    <div className="flex items-center justify-between gap-3 border-b border-current/10 px-3 py-2">
      <h2 className="flex items-center gap-2 text-sm font-bold"><MoodRounded size={20} /> Humeur actuelle</h2>
    </div>
    {person && mood && detail ? <motion.div key={`${person.id}:${mood}`} initial={reduced ? false : { opacity: 0, y: 10, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: reduced ? 0 : .4, ease: [.22, 1, .36, 1] }} id="speaker-mood" role="group" aria-label={`Humeur de ${person.name} : ${mood} sur 4`} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 p-3">
      <div className={`relative grid ${compact ? 'size-20' : 'size-24'} shrink-0 place-items-center overflow-hidden rounded-xl border border-current/15 bg-white text-4xl shadow-sm`} aria-hidden="true">
        <span>{faces[mood - 1]}</span>
        {person.moodSlide && <SpeakerMoodPicture key={`${person.id}:${person.moodSlide.image}:${mood}`} context={person.moodSlide} mood={mood} card />}
      </div>
      <div className="min-w-0">
        <MoodTitle key={`${person.id}:${person.moodSlide?.image}:${mood}`} context={person.moodSlide} mood={mood} fallback={detail.title} />
      </div>
      <ol aria-label="Échelle d’humeur" className="col-span-full grid w-full grid-cols-4 gap-1.5">
        {([1, 2, 3, 4] as const).map(value => <li key={value} aria-current={value === mood ? 'true' : undefined} className="min-w-0"><span className={`grid h-8 min-w-0 place-items-center rounded-md border text-sm font-bold tabular-nums ${value === mood ? 'border-brand bg-brand text-white motion-safe:scale-[1.06]' : 'border-current/15 bg-white/80 text-muted'}`}>{value}<span className="sr-only">{value === mood ? ' : humeur sélectionnée' : ''}</span></span></li>)}
      </ol>
      <div role="img" aria-label={`Niveau ${mood} sur 4`} className="sr-only">{mood}</div>
    </motion.div> : <div className={`flex items-center gap-3 ${compact ? 'p-2' : 'min-h-[92px] p-3'}`}>
      <span className="grid size-12 shrink-0 place-items-center rounded-md bg-slate-50 text-muted"><MoodRounded /></span>
      <p className="text-xs leading-relaxed text-muted">{person ? 'Aucune humeur renseignée pour ce passage.' : 'La prochaine humeur apparaîtra avec la personne qui prend la parole.'}</p>
    </div>}
  </section>;
}