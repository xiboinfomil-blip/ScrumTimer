import type { HistoryRound, HistoryPerson } from '../history/history.ts';
import type { Person, MoodSlideContext } from '../../types/team.ts';

export function groupDailyMoods(round: HistoryRound, roster: Person[]) {
  const groups = new Map<string, { key: string; title: string; context: MoodSlideContext | null; people: HistoryPerson[] }>();
  for (const person of round.people) {
    const saved = roster.find(candidate => candidate.id === person.id);
    // Only associate an exact, unchanged check-in from before this round finished.
    const context = saved?.moodSlide && saved.mood === person.mood && saved.moodSlide.title === person.meterTitle && saved.moodUpdatedAt && new Date(saved.moodUpdatedAt).getTime() <= new Date(round.completedAt).getTime() ? saved.moodSlide : null;
    const key = context ? `image:${context.image}` : `title:${person.meterTitle ?? ''}`;
    const group = groups.get(key) ?? { key, title: person.meterTitle ?? 'Baromètre non renseigné', context, people: [] };
    group.people.push(person);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({ ...group, choices: ([1, 4, 2, 3] as const).map(mood => ({ mood, people: group.people.filter(person => person.mood === mood) })), missing: group.people.filter(person => person.mood === null) }));
}