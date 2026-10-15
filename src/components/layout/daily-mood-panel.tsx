'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useTeam } from '@/providers/team-provider';
import { groupDailyMoods } from '@/lib/daily-moods';
import type { HistoryRound } from '@/lib/history';
import { MoodSlidePreview } from '@/components/ui/mood-slide-preview';

const moodColors = ['border-blue-200 bg-blue-50 text-blue-900', 'border-teal-200 bg-teal-50 text-teal-900', 'border-violet-200 bg-violet-50 text-violet-900', 'border-orange-200 bg-orange-50 text-orange-900'];

export function DailyMoodPanel({ round }: { round: HistoryRound }) {
  const { state } = useTeam();
  const reduced = useReducedMotion();
  const groups = groupDailyMoods(round, state.roster);
  return <section aria-labelledby="daily-moods-heading" className="min-w-0 space-y-4" data-dashboard-column="moods">
    <header className="rounded-2xl border border-orange-200 bg-orange-50 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-amber-800">02 · Les humeurs de l’équipe</p><h2 id="daily-moods-heading" className="mt-1 text-lg font-bold text-brand">Baromètres & choix partagés</h2><p className="mt-2 text-xs text-muted">Chaque image garde ses propres groupes. Les couleurs distinguent les repères 1–4 : ce ne sont ni des notes, ni un classement.</p></header>
    {groups.map((group, index) => <motion.article key={group.key} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .3, delay: reduced ? 0 : Math.min(index, 4) * .05 }} className="min-w-0 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-bold text-brand">{group.title}</h3><span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-brand">{group.people.length} choix</span></div>
      {group.context ? <MoodSlidePreview key={group.context.image} context={group.context} idPrefix={`daily-meter-${index}`} /> : <div className="mt-3 rounded-xl border border-dashed border-line bg-slate-50 p-4 text-xs leading-relaxed text-muted" role="status">Image exacte non disponible pour ce bilan. Le titre et les choix enregistrés sont conservés ; aucune autre image n’est substituée.</div>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{group.choices.map(({ mood, people }) => <div key={mood} className={`min-w-0 rounded-xl border p-3 ${moodColors[mood - 1]}`} data-mood-choice={mood}>
        <div className="flex items-center justify-between gap-2"><h4 className="flex items-center gap-2 text-xs font-bold"><span className="grid size-6 place-items-center rounded-full border border-current">{mood}</span>Repère {mood}</h4><span className="text-xs font-bold tabular-nums">{people.length}</span></div>
        {people.length ? <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`${group.title}, repère ${mood}`}>{people.map(person => <li key={person.id} className="max-w-full break-words rounded-lg border border-current/15 bg-white/70 px-2 py-1 text-[11px] font-medium">{person.name}</li>)}</ul> : <p className="mt-2 text-[10px] opacity-75">Aucun choix</p>}
      </div>)}</div>
      {group.missing.length > 0 && <div className="mt-3 rounded-lg bg-slate-100 p-3 text-xs text-muted"><h4 className="font-semibold">Sans repère renseigné · {group.missing.length}</h4><ul className="mt-1 flex flex-wrap gap-2">{group.missing.map(person => <li key={person.id}>{person.name}</li>)}</ul></div>}
    </motion.article>)}
    <p className="text-[10px] leading-relaxed text-muted">Les humeurs ne modifient jamais les points. Les archives ne gardent pas les images : l’aperçu apparaît uniquement lorsqu’un choix individuel inchangé conserve sa diapositive exacte dans l’équipe.</p>
  </section>;
}