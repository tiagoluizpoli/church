import { Link, useLocation } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutDashboard,
  Menu,
  Search,
} from 'lucide-react';
import * as React from 'react';
import { TimezoneToggle } from '../shared/components/timezone-toggle';
import { useCallerRoles } from '../shared/hooks/use-caller-roles';
import { CommandPalette } from './command-palette';
import { MobileDrawer } from './mobile-drawer';
import { ModeToggle } from './mode-toggle';
import { NotificationBell } from './notification-bell/notification-bell';
import UserMenu from './user-menu';

interface AppShellProps {
  children: React.ReactNode;
}

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}

const BASE_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Availability', to: '/availability', icon: Clock },
];

const SCHEDULING_NAV_ITEM: NavItem = {
  label: 'Scheduling',
  to: '/scheduling',
  icon: CalendarClock,
};

function isActivePath({
  pathname,
  target,
}: {
  pathname: string;
  target: string;
}): boolean {
  return pathname === target || pathname.startsWith(`${target}/`);
}

function isOpaqueIdSegment(segment: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment);
}

function toBreadcrumbLabel(segment: string): string {
  const normalized = segment.replace(/[-_]/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function AppShell({ children }: AppShellProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = React.useState(false);
  const location = useLocation();
  const { canSeeScheduling } = useCallerRoles();
  const navItems: NavItem[] = canSeeScheduling
    ? [...BASE_NAV_ITEMS, SCHEDULING_NAV_ITEM]
    : BASE_NAV_ITEMS;

  // Listen for CTRL+K / CMD+K globally
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Compute breadcrumbs dynamically based on path
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const breadcrumbs = [
    { label: 'Home', to: '/' },
    ...pathSegments.flatMap((segment, index) => {
      if (isOpaqueIdSegment(segment)) {
        return [];
      }

      const to = `/${pathSegments.slice(0, index + 1).join('/')}`;
      return [{ label: toBreadcrumbLabel(segment), to }];
    }),
  ];

  const handleToggle = React.useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const handleDrawerOpenChange = React.useCallback((open: boolean) => {
    setIsDrawerOpen(open);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground md:flex-row">
      {/* 1. Mobile Sticky Top Header */}
      <header
        data-testid="mobile-top-header"
        className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-sidebar-border border-b bg-sidebar/95 px-4 backdrop-blur md:hidden"
      >
        <div className="flex items-center gap-3">
          <div className="radius-icon flex h-10 w-10 items-center justify-center bg-primary/12 text-primary shadow-sm">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <span className="block font-semibold text-[1.05rem] tracking-tight">
              Church CRM
            </span>
            <span className="block text-muted-foreground text-xs">
              Calm scheduling
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NotificationBell />

          <button
            type="button"
            onClick={() => setIsPaletteOpen(true)}
            className="radius-icon flex h-11 w-11 items-center justify-center border border-sidebar-border bg-background/80 p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>

          <button
            type="button"
            data-testid="mobile-drawer-trigger"
            onClick={() => setIsDrawerOpen(true)}
            className="radius-icon flex h-11 w-11 items-center justify-center border border-sidebar-border bg-background/80 p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* 2. Desktop Sidebar */}
      <motion.aside
        data-testid="sidebar"
        animate={{ width: isCollapsed ? 64 : 240 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="hidden shrink-0 flex-col overflow-hidden border-sidebar-border border-r bg-sidebar md:flex"
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between border-sidebar-border border-b px-4">
          {!isCollapsed ? (
            <div className="flex items-center gap-3">
              <div className="radius-icon flex h-10 w-10 items-center justify-center bg-primary/12 text-primary shadow-sm">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <span className="block font-semibold text-[1.05rem] tracking-tight">
                  Church CRM
                </span>
                <span className="block text-muted-foreground text-xs">
                  Scheduling workspace
                </span>
              </div>
            </div>
          ) : (
            <div className="radius-icon mx-auto flex h-10 w-10 items-center justify-center bg-primary/12 text-primary shadow-sm">
              <CalendarClock className="h-5 w-5" />
            </div>
          )}
          <button
            type="button"
            data-testid="sidebar-toggle"
            onClick={handleToggle}
            className="radius-icon border border-sidebar-border bg-background/80 p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Sidebar Nav */}
        <nav className="flex-1 space-y-1 px-3 py-5">
          {navItems.map((item) => {
            const isActive = isActivePath({
              pathname: location.pathname,
              target: item.to,
            });
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`radius-surface flex items-center gap-3 border px-3 py-2.5 font-medium text-sm transition-colors ${
                  isActive
                    ? 'border-primary/15 bg-primary/11 font-semibold text-foreground shadow-sm'
                    : 'border-transparent text-sidebar-foreground/78 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                <span
                  className={`radius-icon flex h-9 w-9 shrink-0 items-center justify-center ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background/72 text-sidebar-foreground/75'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </span>
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{
                        type: 'spring',
                        stiffness: 300,
                        damping: 30,
                      }}
                      className="overflow-hidden whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
        </nav>
      </motion.aside>

      {/* 3. Main Content Container */}
      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        {/* Desktop Topbar */}
        <header className="hidden h-16 shrink-0 items-center justify-between border-border/70 border-b bg-background/92 px-[var(--workspace-pad-x)] backdrop-blur md:flex">
          {/* Breadcrumbs */}
          <nav
            data-testid="breadcrumbs"
            className="flex items-center space-x-2 text-muted-foreground text-sm"
            aria-label="Breadcrumb"
          >
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.to}>
                  {index > 0 && <span className="text-border">/</span>}
                  {isLast ? (
                    <span className="font-semibold text-foreground">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      to={crumb.to}
                      className="transition-colors hover:text-foreground"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </React.Fragment>
              );
            })}
          </nav>

          {/* Right side controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPaletteOpen(true)}
              className="radius-icon border border-border bg-card/88 p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </button>
            <NotificationBell />
            <TimezoneToggle />
            <ModeToggle />
            <UserMenu />
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto px-[var(--workspace-pad-x)] py-[var(--workspace-pad-y)]">
          <div className="w-full">{children}</div>
        </main>
      </div>

      {/* 4. Mobile Bottom Navigation Bar */}
      <nav
        data-testid="mobile-bottom-nav"
        className="fixed right-0 bottom-0 left-0 z-40 flex h-16 items-center justify-around border-sidebar-border border-t bg-sidebar/96 px-2 backdrop-blur md:hidden"
      >
        {navItems.map((item) => {
          const isActive = isActivePath({
            pathname: location.pathname,
            target: item.to,
          });
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`radius-surface flex h-12 min-w-20 flex-col items-center justify-center px-2 text-xs transition-colors ${
                isActive
                  ? 'bg-primary/10 font-semibold text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="mb-0.5 h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 5. Mobile Drawer Menu */}
      <MobileDrawer open={isDrawerOpen} onOpenChange={handleDrawerOpenChange}>
        <div className="flex flex-col space-y-4">
          <div className="flex items-center justify-between border-sidebar-border border-b pb-2">
            <div className="space-y-0.5">
              <span className="block font-semibold text-lg">Navigation</span>
              <span className="block text-muted-foreground text-xs">
                Move between your core workflows.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <TimezoneToggle />
              <ModeToggle />
            </div>
          </div>

          <nav className="flex flex-col space-y-1">
            {navItems.map((item) => {
              const isActive = isActivePath({
                pathname: location.pathname,
                target: item.to,
              });
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsDrawerOpen(false)}
                  className={`radius-surface flex h-12 items-center gap-3 border px-4 py-3 font-medium text-base transition-colors ${
                    isActive
                      ? 'border-primary/15 bg-primary/11 font-semibold text-foreground'
                      : 'border-sidebar-border/55 text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <span
                    className={`radius-icon flex h-9 w-9 shrink-0 items-center justify-center ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background/80 text-muted-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center justify-between border-sidebar-border border-t pt-4">
            <span className="text-muted-foreground text-sm">
              Logged in user
            </span>
            <UserMenu />
          </div>
        </div>
      </MobileDrawer>

      {/* 6. Command Palette */}
      <CommandPalette open={isPaletteOpen} onOpenChange={setIsPaletteOpen} />
    </div>
  );
}
