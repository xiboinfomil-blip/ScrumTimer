'use client';

import { useState } from 'react';
import { Button, NativeSelect, InputBase, Dialog, DialogTitle, DialogContent, DialogActions, useMediaQuery } from '@mui/material';
import { useTeam } from '@/providers/team-provider';
import { groupDailyMoods } from '@/lib/daily-moods';
import type { HistoryRound } from '@/lib/history';
import { MoodSlidePreview } from '@/components/ui/mood-slide-preview';

const moodColors = ['border-blue-200/80 bg-blue-50/70 text-blue-900', 'border-teal-200/80 bg-teal-50/70 text-teal-900', 'border-violet-200/80 bg-violet-50/70 text-violet-900', 'border-orange-200/80 bg-orange-50/70 text-orange-900'];

export function DailyMoodPanel({ round }: { round: HistoryRound }) {
  const { state } = useTeam();
  const [selected, setSelected] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState(false);
  const short = useMediaQuery('(max-height: 650px)');
  const groups = groupDailyMoods(round, state.roster);
  const index = Math.min(selected, Math.max(0, groups.length - 1));
  const group = groups[index];
  if (!group) return null;
  const people = choice === null ? group.people : group.people.filter(person => person.mood === choice);
  const capacity = short ? 1 : 2;
  const pages = Math.max(1, Math.ceil(people.length / capacity));
  const current = Math.min(page, pages - 1);
  return <section aria-labelledby="daily-moods-heading" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden rounded-2xl border border-line bg-white p-4 max-[650px]:gap-1 max-[650px]:p-2 [@media(max-height:650px)]:gap-0.5 [@media(max-height:650px)]:p-2" data-dashboard-column="moods">
    <header className="flex shrink-0 items-center justify-between gap-1"><h2 id="daily-moods-heading" className={short && groups.length > 1 ? 'sr-only' : 'truncate text-sm font-bold text-ink'} title={group.title}>Les humeurs de l’équipe</h2>{short && groups.length > 1 && <NativeSelect value={index} onChange={event => { setSelected(Number(event.target.value)); setChoice(null); setPage(0); }} input={<InputBase />} inputProps={{ 'aria-label': 'Baromètre du bilan' }} sx={{ minHeight: 44, minWidth: 0, flex: 1, fontSize: 12, bgcolor: 'action.hover', borderRadius: '12px', '& select': { pl: 1 } }}>{groups.map((item, itemIndex) => <option key={item.key} value={itemIndex}>{item.title}</option>)}</NativeSelect>}{short && group.context && <Button sx={{ minHeight: 44, minWidth: 44, fontSize: 11, px: 1, borderRadius: '12px', textTransform: 'none' }} onClick={() => setPreview(true)}>Voir image</Button>}</header>
    {!short && (groups.length > 1 ? <NativeSelect value={index} onChange={event => { setSelected(Number(event.target.value)); setChoice(null); setPage(0); }} input={<InputBase />} inputProps={{ 'aria-label': 'Baromètre du bilan' }} sx={{ minHeight: 44, flexShrink: 0, fontSize: 12, bgcolor: 'action.hover', borderRadius: '12px', '& select': { pl: 1 } }}>{groups.map((item, itemIndex) => <option key={item.key} value={itemIndex}>{item.title} · {item.people.length} choix</option>)}</NativeSelect> : <p className="shrink-0 truncate text-[11px] text-muted" title={group.title}>{group.title}</p>)}
    {!short && (group.context ? <MoodSlidePreview key={group.context.image} compact context={group.context} idPrefix={`daily-meter-${index}`} /> : <p className="shrink-0 rounded-xl bg-slate-50 p-2 text-[11px] text-muted" role="status">Image exacte non disponible. Titre et choix conservés, sans image de remplacement.</p>)}
    <div className="grid shrink-0 grid-cols-2 gap-1" aria-label="Repères du baromètre">{group.choices.map(({ mood, people: members }) => <Button key={mood} data-mood-choice={mood} aria-pressed={choice === mood} onClick={() => { setChoice(choice === mood ? null : mood); setPage(0); }} className={`border! ${moodColors[mood - 1]} ${choice === mood ? 'ring-2 ring-brand ring-inset' : ''}`} sx={{ minHeight: 44, minWidth: 0, px: 1.25, fontSize: 12, justifyContent: 'space-between', textTransform: 'none', borderRadius: '12px' }}><span>Repère {mood}</span><strong className="tabular-nums">{members.length}</strong></Button>)}</div>
    <div className="flex shrink-0 flex-col overflow-hidden" key={`${group.key}-${choice}`}>
      <ul className="daily-mood-list" aria-label="Choix individuels">{people.slice(current * capacity, (current + 1) * capacity).map(person => <li key={person.id} className="flex h-6 shrink-0 items-center gap-2 px-1 text-xs"><span className={`grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-semibold ${person.mood ? moodColors[person.mood - 1] : 'bg-slate-100 text-muted'}`}>{person.mood ?? '—'}</span><span className="truncate font-medium" title={person.name}>{person.name}</span></li>)}</ul>
      {!people.length && <p className="text-[11px] text-muted">Aucun choix pour ce repère.</p>}
      <nav className="flex h-11 items-center justify-between" aria-label="Pages des choix"><Button disabled={current === 0} sx={{ minHeight: 44, minWidth: 44, borderRadius: '12px' }} aria-label="Choix précédents" onClick={() => setPage(current - 1)}>←</Button><span className="text-[11px] tabular-nums text-muted" aria-live="polite">{choice === null ? 'Tous' : `Repère ${choice}`} · {current + 1}/{pages}</span><Button disabled={current === pages - 1} sx={{ minHeight: 44, minWidth: 44, borderRadius: '12px' }} aria-label="Choix suivants" onClick={() => setPage(current + 1)}>→</Button></nav>
    </div>
    <p className="shrink-0 text-[11px] leading-tight text-muted [@media(max-height:650px)]:hidden">Couleurs = repères, pas des notes. L’humeur ne change pas les points.</p>
    <Dialog open={preview} onClose={() => setPreview(false)} fullWidth maxWidth="md" aria-labelledby="daily-image-title"><DialogTitle id="daily-image-title">{group.title}</DialogTitle><DialogContent>{group.context && <MoodSlidePreview context={group.context} idPrefix="daily-meter-dialog" />}</DialogContent><DialogActions><Button sx={{ minHeight: 44 }} onClick={() => setPreview(false)}>Fermer l’image</Button></DialogActions></Dialog>
  </section>;
}