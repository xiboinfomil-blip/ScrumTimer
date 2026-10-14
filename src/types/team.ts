export type Mood = 1 | 2 | 3 | 4;
export interface MoodSlideContext { title: string; image: string; slideNumber: number }

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
  currentMoodSlide?: MoodSlideContext | null;
}