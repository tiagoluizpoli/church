import { appConfig } from '@church/app-config';
import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import {
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  House,
  Layers,
  LayoutTemplate,
  Mail,
  Menu,
  Search,
  Users,
  UsersRound,
} from 'lucide-react';
import * as React from 'react';
import { useCallerCapabilitiesScope } from '../shared/components/caller-capabilities-scope';
import {
  type CallerCapabilities,
  isAdminOrLeader,
  useCallerCapabilities,
} from '../shared/hooks/use-caller-capabilities';
import { ActiveChurchTabSyncGuard } from './active-church-tab-sync-guard';
import { CommandPalette } from './command-palette';
import { MobileDrawer } from './mobile-drawer';
import { ModeToggle } from './mode-toggle';
import UserMenu from './user-menu';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { activeChurchApi } from '@/utils/api-instances';

export interface BreadcrumbSegmentOverride {
  segment: string;
  /** Null hides the segment's crumb. */
  label: string | null;
}

interface AppShellProps {
  children: React.ReactNode;
  breadcrumbOverrides?: BreadcrumbSegmentOverride[];
  notificationBell: React.ReactNode;
}
interface NavIconProps {
  className?: string;
}

type NavGroup = 'home' | 'serving' | 'scheduling' | 'church';

interface NavEntry {
  group: NavGroup;
  label: () => string;
  to: string;
  icon: React.ComponentType<NavIconProps>;
  isVisible: (capabilities: CallerCapabilities) => boolean;
}

interface IsOpaqueIdSegmentInput {
  segment: string;
}

interface IsEntryActiveInput {
  pathname: string;
  entry: NavEntry;
}

interface ResolveBreadcrumbLabelInput {
  segment: string;
  overridesBySegment: Map<string, string | null>;
}

interface BreadcrumbItemModel {
  label: string;
  to: string;
  isLast: boolean;
}

interface GetSelectChurchDestinationInput {
  destination: string;
}

interface NavListProps {
  groups: NavGroupModel[];
  pathname: string;
  variant: 'sidebar' | 'collapsed' | 'drawer';
  onNavigate?: () => void;
}

interface NavGroupModel {
  group: NavGroup;
  entries: NavEntry[];
}

// The one nav list: add or retarget an entry here. Order is render order.
const NAV_ENTRIES: NavEntry[] = [
  {
    group: 'home',
    label: () => m.nav_home(),
    to: '/',
    icon: House,
    isVisible: () => true,
  },
  {
    group: 'serving',
    label: () => m.nav_my_schedule(),
    to: '/my-schedule',
    icon: CalendarCheck,
    isVisible: (c) => c.hasVolunteerMembership,
  },
  {
    group: 'serving',
    label: () => m.nav_availability(),
    to: '/availability',
    icon: Clock,
    isVisible: (c) => c.hasVolunteerMembership,
  },
  {
    group: 'scheduling',
    label: () => m.nav_schedules(),
    to: '/schedules',
    icon: UsersRound,
    isVisible: isAdminOrLeader,
  },
  {
    group: 'scheduling',
    label: () => m.nav_cycles(),
    to: '/cycles',
    icon: CalendarRange,
    isVisible: (c) => c.isChurchAdmin,
  },
  {
    group: 'scheduling',
    label: () => m.nav_event_templates(),
    to: '/event-templates',
    icon: LayoutTemplate,
    isVisible: (c) => c.isChurchAdmin,
  },
  {
    group: 'church',
    label: () => m.nav_ministries(),
    to: '/ministries',
    icon: Layers,
    isVisible: isAdminOrLeader,
  },
  {
    group: 'church',
    label: () => m.nav_people(),
    to: '/people',
    icon: Users,
    isVisible: isAdminOrLeader,
  },
  {
    group: 'church',
    label: () => m.nav_invitations(),
    to: '/invitations',
    icon: Mail,
    isVisible: isAdminOrLeader,
  },
];

const GROUP_ORDER: NavGroup[] = ['home', 'serving', 'scheduling', 'church'];

// Home has no heading.
const GROUP_HEADINGS: Record<NavGroup, (() => string) | null> = {
  home: null,
  serving: () => m.nav_group_serving(),
  scheduling: () => m.nav_group_scheduling(),
  church: () => m.nav_group_church(),
};

// Pages that light up an entry besides its own path: Home's page is still
// /dashboard until Spec 31, Availability redirects into /volunteer/availability.
const EXTRA_ACTIVE_PATHS: Record<string, string[]> = {
  '/': ['/dashboard'],
  '/availability': ['/volunteer/availability'],
};

// Static URL segment -> catalog label. A spec adding a segment adds it here.
const BREADCRUMB_SEGMENT_LABELS: Record<string, () => string> = {
  dashboard: () => m.breadcrumb_dashboard(),
  availability: () => m.nav_availability(),
  notifications: () => m.breadcrumb_notifications(),
  cycles: () => m.nav_cycles(),
  new: () => m.breadcrumb_new(),
  'event-templates': () => m.nav_event_templates(),
  schedules: () => m.nav_schedules(),
  assign: () => m.breadcrumb_assign(),
  volunteer: () => m.breadcrumb_volunteer(),
  'my-schedule': () => m.nav_my_schedule(),
  ministries: () => m.nav_ministries(),
  people: () => m.nav_people(),
  invitations: () => m.nav_invitations(),
  ministry: () => m.breadcrumb_ministry(),
};

function isEntryActive({ pathname, entry }: IsEntryActiveInput): boolean {
  if (entry.to === '/' && pathname === '/') {
    return true;
  }
  const targets = [
    ...(entry.to === '/' ? [] : [entry.to]),
    ...(EXTRA_ACTIVE_PATHS[entry.to] ?? []),
  ];
  return targets.some(
    (target) => pathname === target || pathname.startsWith(`${target}/`),
  );
}

function isOpaqueIdSegment({ segment }: IsOpaqueIdSegmentInput): boolean {
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment);
}

function toBreadcrumbLabel({ segment }: IsOpaqueIdSegmentInput): string {
  const mapped = BREADCRUMB_SEGMENT_LABELS[segment];
  if (mapped) {
    return mapped();
  }
  // Unmapped static segment: visible English on purpose, so the gap shows.
  const normalized = segment.replace(/[-_]/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function resolveBreadcrumbLabel({
  segment,
  overridesBySegment,
}: ResolveBreadcrumbLabelInput): string | null {
  const override = overridesBySegment.get(segment);
  if (override !== undefined) {
    return override;
  }

  if (isOpaqueIdSegment({ segment })) {
    return null;
  }

  return toBreadcrumbLabel({ segment });
}

interface ChurchNameProps {
  name: string | null;
}

function ChurchName({ name }: ChurchNameProps) {
  return name === null ? (
    <Skeleton data-testid="church-name-skeleton" className="h-5 w-28" />
  ) : (
    <span className="block truncate font-semibold text-[1.05rem] tracking-tight">
      {name}
    </span>
  );
}

function getSelectChurchDestination({
  destination,
}: GetSelectChurchDestinationInput): string {
  return `/select-church?redirect=${encodeURIComponent(destination)}`;
}

// One render for the desktop sidebar (expanded or icon-only) and the drawer.
function NavList({ groups, pathname, variant, onNavigate }: NavListProps) {
  return (
    <nav
      className={
        variant === 'collapsed'
          ? 'flex-1 space-y-0.5 px-2 py-5'
          : variant === 'sidebar'
            ? 'flex-1 space-y-1 px-3 py-5'
            : 'flex flex-col space-y-1'
      }
    >
      {groups.map(({ group, entries }) => {
        const heading = GROUP_HEADINGS[group];
        return (
          <div key={group} className="space-y-1">
            {heading && variant !== 'collapsed' ? (
              <p className="px-3 pt-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {heading()}
              </p>
            ) : null}
            {entries.map((entry) => {
              const isActive = isEntryActive({ pathname, entry });
              const Icon = entry.icon;
              const label = entry.label();

              if (variant === 'collapsed') {
                return (
                  <Tooltip key={entry.to}>
                    <TooltipTrigger
                      render={
                        <Link
                          to={entry.to}
                          aria-current={isActive ? 'page' : undefined}
                          aria-label={label}
                          className={`radius-icon mx-auto flex h-10 w-10 shrink-0 items-center justify-center transition-colors ${
                            isActive
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                          }`}
                        />
                      }
                    >
                      <Icon className="h-4.5 w-4.5 shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
                );
              }

              if (variant === 'sidebar') {
                return (
                  <Link
                    key={entry.to}
                    to={entry.to}
                    aria-current={isActive ? 'page' : undefined}
                    className={`radius-surface flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-sidebar-accent ${
                      isActive
                        ? 'font-semibold text-primary'
                        : 'font-medium text-sidebar-foreground/78 hover:text-sidebar-accent-foreground'
                    }`}
                  >
                    <Icon
                      className={`h-4.5 w-4.5 shrink-0 ${
                        isActive ? 'text-primary' : 'text-sidebar-foreground/60'
                      }`}
                    />
                    <span className="overflow-hidden whitespace-nowrap">
                      {label}
                    </span>
                  </Link>
                );
              }

              return (
                <Link
                  key={entry.to}
                  to={entry.to}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={onNavigate}
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
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({
  children,
  breadcrumbOverrides,
  notificationBell,
}: AppShellProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  // Typed wide: the shipped value is a literal `false`.
  const { commandPalette: paletteEnabled } = appConfig.parked;
  const [isPaletteOpen, setIsPaletteOpen] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const capabilities = useCallerCapabilities();
  const visibleEntries = NAV_ENTRIES.filter((entry) =>
    entry.isVisible(capabilities),
  );
  const navGroups: NavGroupModel[] = GROUP_ORDER.flatMap((group) => {
    const entries = visibleEntries.filter((entry) => entry.group === group);
    return entries.length > 0 ? [{ group, entries }] : [];
  });
  const mobileSubtitle =
    visibleEntries
      .find((entry) => isEntryActive({ pathname: location.pathname, entry }))
      ?.label() ?? null;
  // Same query key as /select-church, so the cache is shared.
  const churchScope = useCallerCapabilitiesScope();
  const { data: churchOptions } = useQuery({
    queryKey: ['active-church', 'options'],
    queryFn: () => activeChurchApi.listActiveChurchOptions(),
  });
  const churches = churchOptions?.churches ?? [];
  // Outside an Active Church (e.g. a Ministry Invitation for someone with no
  // Church Membership yet) there is no Church name to wait for.
  const churchName = churchScope
    ? (churches.find((church) => church.churchId === churchScope.churchId)
        ?.name ?? null)
    : appConfig.appName;
  const canSwitchChurch = churches.length >= 2;
  const selectChurchDestination = getSelectChurchDestination({
    destination: location.href,
  });

  // Listen for CTRL+K / CMD+K globally
  React.useEffect(() => {
    if (!paletteEnabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paletteEnabled]);

  // Compute breadcrumbs dynamically based on path. `isLast` is tracked
  // against the *raw* path segments, not the filtered array — an opaque
  // trailing id may still resolve to a human label via `breadcrumbOverrides`
  // (supplied by the composition root for whichever feature route is
  // active). When no label is known yet, the hidden-id rule still applies,
  // so the last visible crumb remains a real link rather than being
  // mislabeled as the current page.
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const overridesBySegment = React.useMemo(
    () =>
      new Map([
        ...(breadcrumbOverrides ?? []).map(
          (override): [string, string | null] => [
            override.segment,
            override.label,
          ],
        ),
      ]),
    [breadcrumbOverrides],
  );
  const breadcrumbs: BreadcrumbItemModel[] = [
    { label: m.nav_home(), to: '/', isLast: pathSegments.length === 0 },
    ...pathSegments.flatMap((segment, index) => {
      const label = resolveBreadcrumbLabel({
        segment,
        overridesBySegment,
      });

      if (label === null) {
        return [];
      }

      const to = `/${pathSegments.slice(0, index + 1).join('/')}`;
      return [
        {
          label,
          to,
          isLast: index === pathSegments.length - 1,
        },
      ];
    }),
  ];

  const handleToggle = React.useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const handleDrawerOpenChange = React.useCallback((open: boolean) => {
    setIsDrawerOpen(open);
  }, []);

  const handleSwitchChurch = React.useCallback(() => {
    navigate({ to: selectChurchDestination });
  }, [navigate, selectChurchDestination]);

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
            <ChurchName name={churchName} />
            {mobileSubtitle ? (
              <span className="block text-muted-foreground text-xs">
                {mobileSubtitle}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {paletteEnabled && (
            <button
              type="button"
              onClick={() => setIsPaletteOpen(true)}
              className="radius-icon flex h-11 w-11 items-center justify-center border border-sidebar-border bg-background/80 p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>
          )}

          {notificationBell}

          <button
            type="button"
            data-testid="mobile-drawer-trigger"
            onClick={() => setIsDrawerOpen(true)}
            className="radius-icon flex h-11 w-11 items-center justify-center border border-sidebar-border bg-background/80 p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label={m.nav_open_menu()}
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
        <div
          className={`flex h-16 items-center border-sidebar-border border-b ${isCollapsed ? 'px-2' : 'px-4'}`}
        >
          {!isCollapsed ? (
            <div className="flex items-center gap-3">
              <div className="radius-icon flex h-10 w-10 items-center justify-center bg-primary/12 text-primary shadow-sm">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <ChurchName name={churchName} />
              </div>
            </div>
          ) : (
            <div className="radius-icon mx-auto flex h-10 w-10 items-center justify-center bg-primary/12 text-primary shadow-sm">
              <CalendarClock className="h-5 w-5" />
            </div>
          )}
        </div>

        {canSwitchChurch ? (
          <div className={isCollapsed ? 'px-2 py-3' : 'px-3 py-3'}>
            <button
              type="button"
              onClick={handleSwitchChurch}
              className="radius-surface flex h-10 w-full items-center justify-center border border-sidebar-border bg-sidebar-accent/60 px-3 font-medium text-sidebar-foreground text-sm transition-colors hover:bg-sidebar-accent"
            >
              <span className={isCollapsed ? 'sr-only' : undefined}>
                {m.nav_switch_church()}
              </span>
              {isCollapsed ? <UsersRound className="size-4" /> : null}
            </button>
          </div>
        ) : null}

        {/* Sidebar Nav */}
        <TooltipProvider delay={120}>
          <NavList
            groups={navGroups}
            pathname={location.pathname}
            variant={isCollapsed ? 'collapsed' : 'sidebar'}
          />
        </TooltipProvider>
      </motion.aside>

      {/* 3. Main Content Container */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop Topbar */}
        <header className="relative hidden h-16 shrink-0 items-center justify-between border-border/70 border-b bg-background/92 px-(--workspace-pad-x) backdrop-blur md:flex">
          {/* Sidebar toggle + Breadcrumbs */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              data-testid="sidebar-toggle"
              onClick={handleToggle}
              className="radius-icon flex h-8 w-8 shrink-0 items-center justify-center border border-border bg-card/88 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={
                isCollapsed ? m.nav_expand_sidebar() : m.nav_collapse_sidebar()
              }
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
            <Breadcrumb data-testid="breadcrumbs">
              <BreadcrumbList className="flex-nowrap text-sm">
                {breadcrumbs.map((crumb, index) => {
                  const isLast = crumb.isLast;
                  return (
                    <React.Fragment key={crumb.to}>
                      {index > 0 && <BreadcrumbSeparator />}
                      <BreadcrumbItem>
                        {isLast ? (
                          <BreadcrumbPage className="font-semibold">
                            {crumb.label}
                          </BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink
                            render={
                              <Link
                                to={crumb.to}
                                activeOptions={{ exact: true }}
                              />
                            }
                          >
                            {crumb.label}
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </React.Fragment>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-2">
            {paletteEnabled && (
              <button
                type="button"
                onClick={() => setIsPaletteOpen(true)}
                className="radius-surface inline-flex h-8 items-center gap-2 border border-border bg-card/88 px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
                <span className="text-sm">Search</span>
                <span className="hidden rounded-sm border border-border/70 bg-background/90 px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground lg:inline">
                  Ctrl K
                </span>
              </button>
            )}
            <ModeToggle />
            {notificationBell}
            <UserMenu />
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto px-(--workspace-pad-x) py-(--workspace-pad-y)">
          <div className="w-full">{children}</div>
        </main>
      </div>

      {/* 5. Mobile Drawer Menu */}
      <MobileDrawer
        open={isDrawerOpen}
        onOpenChange={handleDrawerOpenChange}
        title={m.shell_drawer_title()}
        description={m.shell_drawer_description()}
      >
        <div className="flex flex-col space-y-4">
          <div className="flex justify-end border-sidebar-border border-b pb-2">
            <ModeToggle />
          </div>

          {canSwitchChurch ? (
            <button
              type="button"
              onClick={() => {
                handleSwitchChurch();
                setIsDrawerOpen(false);
              }}
              className="radius-surface flex h-12 items-center gap-3 border border-sidebar-border/55 px-4 py-3 font-medium text-base text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <UsersRound className="size-4 shrink-0" />
              {m.nav_switch_church()}
            </button>
          ) : null}

          <NavList
            groups={navGroups}
            pathname={location.pathname}
            variant="drawer"
            onNavigate={() => setIsDrawerOpen(false)}
          />

          <div className="flex items-center justify-between border-sidebar-border border-t pt-4">
            <span className="text-muted-foreground text-sm">
              {m.shell_account()}
            </span>
            <UserMenu />
          </div>
        </div>
      </MobileDrawer>

      {/* 6. Command Palette */}
      {paletteEnabled && (
        <CommandPalette open={isPaletteOpen} onOpenChange={setIsPaletteOpen} />
      )}

      {/* 7. Cross-tab Active Church sync guard */}
      <ActiveChurchTabSyncGuard />
    </div>
  );
}
