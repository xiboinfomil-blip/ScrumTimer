import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckIcon from '@mui/icons-material/Check';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HistoryIcon from '@mui/icons-material/History';
import LogoutIcon from '@mui/icons-material/Logout';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';

export function ParticipantIcon({ name, className = 'size-4' }: { name: 'people' | 'plus' | 'reset' | 'trash' | 'edit' | 'arrow' | 'away' | 'check' | 'shield'; className?: string }) {
  const icons = {
    people: GroupsOutlinedIcon,
    plus: AddIcon,
    reset: HistoryIcon,
    trash: DeleteOutlinedIcon,
    edit: EditOutlinedIcon,
    arrow: ArrowForwardIcon,
    away: LogoutIcon,
    check: CheckIcon,
    shield: VerifiedUserOutlinedIcon,
  };
  const Icon = icons[name];
  return <Icon className={className} fontSize="inherit" aria-hidden="true" />;
}