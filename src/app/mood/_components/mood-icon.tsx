import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckIcon from '@mui/icons-material/Check';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PollOutlinedIcon from '@mui/icons-material/PollOutlined';
import ShuffleIcon from '@mui/icons-material/Shuffle';

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
  return <Icon className={className} fontSize="inherit" aria-hidden="true" />;
}