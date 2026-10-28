import type { Mood, TeamState, MoodSlideContext } from '../../types/team';

export function normalizeMoodSlide(value: unknown): MoodSlideContext | null {
  if (!value || typeof value !== 'object') return null;
  const slide = value as Record<string, unknown>;
  if (typeof slide.title !== 'string' || typeof slide.image !== 'string' || !/^\/mood-meters\/slides\/[\w .\-/]+\.(png|jpe?g|gif|webp|svg)$/i.test(slide.image) || slide.image.split('/').slice(1).some(part => !part || part === '.' || part === '..') || typeof slide.slideNumber !== 'number' || !Number.isInteger(slide.slideNumber) || slide.slideNumber < 1 || slide.slideNumber > 10000) return null;
  return { title: slide.title.slice(0, 200), image: slide.image, slideNumber: slide.slideNumber, ...(typeof slide.meterId === 'string' && slide.meterId.length <= 200 ? { meterId: slide.meterId } : {}) };
}

export const createId = () => globalThis.crypto?.randomUUID?.() ?? `person-${Date.now()}-${Math.random()}`;
export const defaultTeam = (): TeamState => ({ roster: [], session: [], duration: 120, warning: 30, sound: true });

export function normalizeTeam(value: unknown): TeamState {
  const state = defaultTeam();
  if (!value || typeof value !== 'object') return state;
  const saved = value as Record<string, unknown>;
  const source = Array.isArray(saved.roster) ? saved.roster : Array.isArray(saved.people) ? saved.people : [];
  const used = new Set<string>();
  state.roster = source.filter(p => p && typeof p.name === 'string' && p.name.trim()).slice(0, 100).map(p => {
    let id = typeof p.id === 'string' && p.id ? p.id : createId();
    if (used.has(id)) id = createId();
    used.add(id);
    return { id, name: p.name.trim().slice(0, 60), present: p.present !== false, mood: [1, 2, 3, 4].includes(p.mood) ? p.mood as Mood : null, moodUpdatedAt: typeof p.moodUpdatedAt === 'string' ? p.moodUpdatedAt : null, moodSlide: normalizeMoodSlide(p.moodSlide) };
  });
  if (typeof saved.duration === 'number' && Number.isInteger(saved.duration) && saved.duration >= 1 && saved.duration <= 3659) state.duration = saved.duration;
  if (typeof saved.warning === 'number' && [0, 10, 15, 30, 60].includes(saved.warning)) state.warning = saved.warning;
  if (typeof saved.sound === 'boolean') state.sound = saved.sound;
  state.usedMoodMeters = Array.isArray(saved.usedMoodMeters) ? [...new Set(saved.usedMoodMeters.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200))].slice(-2000) : [];
  state.currentMoodSlide = normalizeMoodSlide(saved.currentMoodSlide);
  state.postponed = Array.isArray(saved.postponed) ? [...new Set(saved.postponed)].filter((id): id is string => typeof id === 'string' && state.roster.some(p => p.id === id && p.present)) : [];
  if (Array.isArray(saved.session)) state.session = [...new Set(saved.session)].filter((id): id is string => typeof id === 'string' && state.roster.some(p => p.id === id && p.present && (p.mood !== null || state.postponed?.includes(id))));
  return state;
}

export function canStartSession(state: TeamState): boolean {
  const present = state.roster.filter(person => person.present);
  return present.some(person => person.mood !== null && !state.postponed?.includes(person.id)) && present.every(person => person.mood !== null || state.postponed?.includes(person.id));
}

export function hasValidSession(state: TeamState): boolean {
  const present = state.roster.filter(person => person.present);
  return canStartSession(state) && state.session.length === present.length && present.every(person => state.session.includes(person.id));
}