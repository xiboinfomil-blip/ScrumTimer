import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CheckIcon from '@mui/icons-material/Check';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';

export function StatisticsIcon({ name, className = 'size-4' }: { name: 'chart' | 'people' | 'clock' | 'check' | 'refresh' | 'calendar'; className?: string }) {
  const icons = {
    chart: BarChartOutlinedIcon,
    people: GroupsOutlinedIcon,
    clock: AccessTimeIcon,
    check: CheckIcon,
    refresh: RefreshIcon,
    calendar: CalendarMonthOutlinedIcon,
  };
  const Icon = icons[name];
  return <Icon className={className} fontSize="inherit" aria-hidden="true" />;
}