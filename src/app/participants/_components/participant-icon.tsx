import { Plus as AddIcon } from 'lucide-react';
import { ArrowRight as ArrowForwardIcon } from 'lucide-react';
import { Check as CheckIcon } from 'lucide-react';
import { Trash2 as DeleteOutlinedIcon } from 'lucide-react';
import { Pencil as EditOutlinedIcon } from 'lucide-react';
import { Users as GroupsOutlinedIcon } from 'lucide-react';
import { History as HistoryIcon } from 'lucide-react';
import { LogOut as LogoutIcon } from 'lucide-react';
import { ShieldCheck as VerifiedUserOutlinedIcon } from 'lucide-react';

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
  return <Icon className={className} size={16} aria-hidden="true" />;
}