import { ArrowLeft as ArrowBackIcon } from 'lucide-react';
import { ArrowRight as ArrowForwardIcon } from 'lucide-react';
import { Pencil as EditOutlinedIcon } from 'lucide-react';
import { LockKeyhole as LockOutlinedIcon } from 'lucide-react';
import { Pause as PauseIcon } from 'lucide-react';
import { Play as PlayArrowIcon } from 'lucide-react';
import { RotateCcw as ReplayIcon } from 'lucide-react';
import { Shuffle as ShuffleIcon } from 'lucide-react';
import { Timer as TimerOutlinedIcon } from 'lucide-react';
import { History as UpdateIcon } from 'lucide-react';

export function TimerIcon({ name, className = 'size-4' }: { name: 'play' | 'pause' | 'next' | 'reset' | 'later' | 'edit' | 'lock' | 'shuffle' | 'back' | 'timer'; className?: string }) {
  const icons = {
    timer: TimerOutlinedIcon,
    play: PlayArrowIcon,
    pause: PauseIcon,
    next: ArrowForwardIcon,
    reset: ReplayIcon,
    later: UpdateIcon,
    edit: EditOutlinedIcon,
    lock: LockOutlinedIcon,
    shuffle: ShuffleIcon,
    back: ArrowBackIcon,
  };
  const Icon = icons[name];
  return <Icon className={className} size={16} aria-hidden="true" />;
}