import type { SVGProps } from 'react';
import AddIcon from '@mui/icons-material/Add';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineRounded';
import MoodOutlinedIcon from '@mui/icons-material/MoodOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import VolumeOffOutlinedIcon from '@mui/icons-material/VolumeOffOutlined';
import VolumeUpOutlinedIcon from '@mui/icons-material/VolumeUpOutlined';

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

export function NavIcon({ name, color, fontSize, shapeRendering, width = 20, height = 20, ...props }: SVGProps<SVGSVGElement> & { name: NavIconName }) {
  const Icon = icons[name];
  return <Icon {...props} fontSize="inherit" shapeRendering={shapeRendering === undefined ? undefined : String(shapeRendering)} htmlColor={color} width={width} height={height} sx={{ fontSize: fontSize ?? 'inherit', width, height }} aria-hidden="true" />;
}