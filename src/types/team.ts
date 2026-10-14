export type Mood = 1 | 2 | 3 | 4;
export interface MoodSlideContext { title: string; image: string; slideNumber: number; meterId?: string }

export interface Person {
  id: string;
  name: string;
  present: boolean;
  mood: Mood | null;
  moodUpdatedAt: string | null;
  moodSlide?: MoodSlideContext | null;
}

export interface TeamState {
  roster: Person[];
  session: string[];
  duration: number;
  warning: number;
  sound: boolean;
  usedMoodMeters?: string[];
  currentMoodSlide?: MoodSlideContext | null;
  /** Meeting-only postponements, never persisted to Neon. */
  postponed?: string[];
}