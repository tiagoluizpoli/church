import { Link, useLocation } from '@tanstack/react-router';
import { CalendarClock, CalendarRange, UsersRound } from 'lucide-react';

interface SchedulingNavItem {
  isActive: (pathname: string) => boolean;
  description: string;
  icon: typeof CalendarClock;
  label: string;
  to: '/scheduling' | '/scheduling/planning' | '/scheduling/tailoring';
}

const NAV_ITEMS: SchedulingNavItem[] = [
  {
    to: '/scheduling/planning',
    label: 'Planning',
    description: 'Create cycles, apply templates, and lock the period.',
    icon: CalendarRange,
    isActive: (pathname) =>
      pathname === '/scheduling/planning' ||
      pathname.startsWith('/scheduling/planning/'),
  },
  {
    to: '/scheduling/tailoring',
    label: 'Tailoring',
    description: 'Shape ministry participation and fire availability.',
    icon: UsersRound,
    isActive: (pathname) =>
      pathname === '/scheduling/tailoring' ||
      pathname.startsWith('/scheduling/tailoring/') ||
      pathname.startsWith('/scheduling/rostering/'),
  },
  {
    to: '/scheduling',
    label: 'Builder events',
    description: 'Review active events and open the builder.',
    icon: CalendarClock,
    isActive: (pathname) =>
      pathname === '/scheduling' ||
      pathname === '/scheduling/' ||
      pathname.startsWith('/scheduling/events/'),
  },
];

export function SchedulingNav() {
  const location = useLocation();

  return (
    <nav
      className="flex min-w-0 items-center gap-1 border-border border-b"
      aria-label="Scheduling views"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = item.isActive(location.pathname);

        return (
          <Link
            key={item.to}
            to={item.to}
            data-active={isActive}
            title={item.description}
            className="group relative inline-flex min-h-11 items-center gap-2 whitespace-nowrap px-3 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground data-[active=true]:text-foreground"
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
            <span className="absolute inset-x-0 -bottom-px h-0.5 scale-x-0 bg-primary transition-transform group-data-[active=true]:scale-x-100" />
          </Link>
        );
      })}
    </nav>
  );
}
