import { Clock as AccessTimeIcon } from 'lucide-react';
import { ArrowLeft as ArrowBackIcon } from 'lucide-react';
import { ArrowRight as ArrowForwardIcon } from 'lucide-react';
import { Check as CheckIcon } from 'lucide-react';
import { LockKeyhole as LockOutlinedIcon } from 'lucide-react';
import { ChartColumn as PollOutlinedIcon } from 'lucide-react';
import { Shuffle as ShuffleIcon } from 'lucide-react';

export function MoodIcon({ name, className = 'size-4' }: { name: 'back' | 'arrow' | 'shuffle' | 'check' | 'clock' | 'meter' | 'lock'; className?: string }) {
  const icons = {
    back: ArrowBackIcon,
    arrow: ArrowForwardIcon,
    shuffle: ShuffleIcon,
    check: CheckIcon,
    clock: AccessTimeIcon,
    meter: PollOutlinedIcon,
    lock: LockOutlinedIcon,
  };
  const Icon = icons[name];
  return <Icon className={className} size={16} aria-hidden="true" />;
}