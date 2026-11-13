import { Clock as AccessTimeIcon } from 'lucide-react';
import { ChartColumn as BarChartOutlinedIcon } from 'lucide-react';
import { CalendarDays as CalendarMonthOutlinedIcon } from 'lucide-react';
import { Check as CheckIcon } from 'lucide-react';
import { Users as GroupsOutlinedIcon } from 'lucide-react';
import { RefreshCw as RefreshIcon } from 'lucide-react';

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
  return <Icon className={className} size={16} aria-hidden="true" />;
}