import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReplayIcon from '@mui/icons-material/Replay';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import UpdateIcon from '@mui/icons-material/Update';

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
  return <Icon className={className} fontSize="inherit" aria-hidden="true" />;
}