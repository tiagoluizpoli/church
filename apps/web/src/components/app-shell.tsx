import { Link, useLocation } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  Calendar,
  CalendarClock,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  Home,
  LayoutDashboard,
  Menu,
  Search,
  User,
} from 'lucide-react';
import * as React from 'react';
import { TimezoneToggle } from '../shared/components/timezone-toggle';
import { CommandPalette } from './command-palette';
import { MobileDrawer } from './mobile-drawer';
import { ModeToggle } from './mode-toggle';
import UserMenu from './user-menu';

interface AppShellProps {
  children: React.ReactNode;
}

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}

const desktopNavItems: NavItem[] = [
  { label: 'Home', to: '/', icon: Home },
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Shifts', to: '/shifts', icon: Calendar },
  { label: 'Scheduling', to: '/scheduling', icon: CalendarClock },
  { label: 'Alerts', to: '/alerts', icon: Bell },
  { label: 'Availability', to: '/availability', icon: Clock },
  { label: 'Todos', to: '/todos', icon: CheckSquare },
];

const mobileCoreNavItems: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Shifts', to: '/shifts', icon: Calendar },
  { label: 'Alerts', to: '/alerts', icon: Bell },
  { label: 'Profile', to: '/profile', icon: User },
];

export function AppShell({ children }: AppShellProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = React.useState(false);
  const location = useLocation();

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
    ...pathSegments.map((segment, index) => {
      const to = `/${pathSegments.slice(0, index + 1).join('/')}`;
      const label = segment.charAt(0).toUpperCase() + segment.slice(1);
      return { label, to };
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
        className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-border border-b bg-card px-4 md:hidden"
      >
        <span className="font-semibold text-lg tracking-tight">Church CRM</span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPaletteOpen(true)}
            className="flex h-12 w-12 items-center justify-center rounded-sm border border-border p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>

          <button
            type="button"
            data-testid="mobile-drawer-trigger"
            onClick={() => setIsDrawerOpen(true)}
            className="flex h-12 w-12 items-center justify-center rounded-sm border border-border p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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
        className="hidden shrink-0 flex-col overflow-hidden border-border border-r bg-card md:flex"
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between border-border border-b px-4">
          {!isCollapsed && (
            <span className="font-semibold text-lg tracking-tight">
              Church CRM
            </span>
          )}
          <button
            type="button"
            data-testid="sidebar-toggle"
            onClick={handleToggle}
            className="rounded-sm border border-border p-1.5 hover:bg-accent hover:text-accent-foreground"
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
        <nav className="flex-1 space-y-1 px-2 py-4">
          {desktopNavItems.map((item) => {
            const isActive = location.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-sm px-3 py-2 font-medium text-sm transition-colors ${
                  isActive
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
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
        <header className="hidden h-16 shrink-0 items-center justify-between border-border border-b bg-card px-6 md:flex">
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
              className="rounded-sm border border-border p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </button>
            <TimezoneToggle />
            <ModeToggle />
            <UserMenu />
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>

      {/* 4. Mobile Bottom Navigation Bar */}
      <nav
        data-testid="mobile-bottom-nav"
        className="fixed right-0 bottom-0 left-0 z-40 flex h-16 items-center justify-around border-border border-t bg-card px-2 md:hidden"
      >
        {mobileCoreNavItems.map((item) => {
          const isActive = location.pathname === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex h-12 w-12 flex-col items-center justify-center rounded-sm text-xs transition-colors ${
                isActive
                  ? 'font-semibold text-primary'
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
          <div className="flex items-center justify-between border-border border-b pb-2">
            <span className="font-semibold text-lg">Navigation</span>
            <div className="flex items-center gap-2">
              <TimezoneToggle />
              <ModeToggle />
            </div>
          </div>

          <nav className="flex flex-col space-y-1">
            {desktopNavItems.map((item) => {
              const isActive = location.pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsDrawerOpen(false)}
                  className={`flex h-12 items-center gap-3 rounded-sm border border-border/20 px-4 py-3 font-medium text-base transition-colors ${
                    isActive
                      ? 'bg-primary font-semibold text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center justify-between border-border border-t pt-4">
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
