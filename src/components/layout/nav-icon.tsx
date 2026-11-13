import type { SVGProps } from 'react';
import { Plus as AddIcon } from 'lucide-react';
import { ChartColumn as BarChartOutlinedIcon } from 'lucide-react';
import { Check as CheckIcon } from 'lucide-react';
import { CloudCheck as CloudDoneOutlinedIcon } from 'lucide-react';
import { ChevronDown as ExpandMoreIcon } from 'lucide-react';
import { Users as GroupsOutlinedIcon } from 'lucide-react';
import { CircleHelp as HelpOutlineIcon } from 'lucide-react';
import { Smile as MoodOutlinedIcon } from 'lucide-react';
import { RefreshCw as RefreshIcon } from 'lucide-react';
import { Search as SearchIcon } from 'lucide-react';
import { Timer as TimerOutlinedIcon } from 'lucide-react';
import { VolumeX as VolumeOffOutlinedIcon } from 'lucide-react';
import { Volume2 as VolumeUpOutlinedIcon } from 'lucide-react';

export type NavIconName = 'people' | 'mood' | 'timer' | 'help' | 'chart' | 'sound' | 'muted' | 'chevron' | 'search' | 'plus' | 'check' | 'cloud' | 'retry';

const icons = {
  people: GroupsOutlinedIcon,
  mood: MoodOutlinedIcon,
  timer: TimerOutlinedIcon,
  help: HelpOutlineIcon,
  chart: BarChartOutlinedIcon,
  sound: VolumeUpOutlinedIcon,
  muted: VolumeOffOutlinedIcon,
  chevron: ExpandMoreIcon,
  search: SearchIcon,
  plus: AddIcon,
  check: CheckIcon,
  cloud: CloudDoneOutlinedIcon,
  retry: RefreshIcon,
};

export function NavIcon({ name, color, shapeRendering, width = 20, height = 20, ...props }: SVGProps<SVGSVGElement> & { name: NavIconName }) {
  const Icon = icons[name];
  return <Icon {...props} size={16} shapeRendering={shapeRendering === undefined ? undefined : String(shapeRendering)} color={color} width={width} height={height} aria-hidden="true" />;
}