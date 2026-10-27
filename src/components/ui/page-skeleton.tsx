import { Loader } from '@infomil/scrum-shared/ui';

export type PageSkeletonVariant = 'teams' | 'list' | 'mood' | 'timer';

const labels: Record<PageSkeletonVariant, string> = {
  teams: 'Chargement des équipes…',
  list: 'Chargement de votre équipe depuis Neon…',
  mood: 'Chargement du baromètre…',
  timer: 'Chargement du minuteur…',
};

export function skeletonVariantForPath(pathname: string): PageSkeletonVariant {
  if (pathname === '/' || pathname === '/teams') return 'teams';
  if (pathname === '/mood') return 'mood';
  if (pathname === '/timer' || pathname === '/spectator') return 'timer';
  return 'list';
}

export function PageSkeleton({ variant = 'list', scope = 'page', label, className = '' }: {
  variant?: PageSkeletonVariant;
  scope?: 'page' | 'section';
  label?: string;
  className?: string;
}) {
  const section = scope === 'section';
  return <div data-page-skeleton={variant} className={`flex min-h-0 min-w-0 w-full flex-col items-center justify-center overflow-hidden ${section ? 'py-3' : 'mx-auto flex-1 p-4'} ${className}`}>
    <Loader size={section ? 'sm' : 'lg'} label={label ?? labels[variant]} />
  </div>;
}