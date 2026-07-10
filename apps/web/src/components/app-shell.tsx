import { Link, useLocation } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import {
  CalendarClock,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutDashboard,
  Menu,
  Search,
  UsersRound,
} from 'lucide-react';
import * as React from 'react';
import { TimezoneToggle } from '../shared/components/timezone-toggle';
import { useCallerRoles } from '../shared/hooks/use-caller-roles';
import { CommandPalette } from './command-palette';
import { MobileDrawer } from './mobile-drawer';
import { ModeToggle } from './mode-toggle';
import { NotificationBell } from './notification-bell/notification-bell';
import UserMenu from './user-menu';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface BreadcrumbSegmentOverride {
  segment: string;
  label: string;
}

interface AppShellProps {
  children: React.ReactNode;
  breadcrumbOverrides?: BreadcrumbSegmentOverride[];
}

interface NavIconProps {
  className?: string;
}

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<NavIconProps>;
  children?: NavItem[];
}

interface IsOpaqueIdSegmentInput {
  segment: string;
}

interface IsActivePathInput {
  pathname: string;
  target: string;
}

interface ToBreadcrumbLabelInput {
  segment: string;
}

interface ResolveBreadcrumbLabelInput {
  segment: string;
  overridesBySegment: Map<string, string>;
}

interface BreadcrumbItemModel {
  label: string;
  to: string;
  isLast: boolean;
}

interface ActiveNavBranch {
  item: NavItem | null;
  child: NavItem | null;
}

interface FindActiveNavBranchInput {
  pathname: string;
  items: NavItem[];
}

interface NavLabelInput {
  itemLabel: string;
  childLabel: string | null;
}

const BASE_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Availability', to: '/availability', icon: Clock },
];

const SCHEDULING_NAV_ITEM: NavItem = {
  label: 'Scheduling',
  to: '/scheduling',
  icon: CalendarClock,
  children: [
    {
      label: 'Cycles',
      to: '/scheduling/planning-cycles',
      icon: CalendarRange,
    },
    { label: 'Tailoring', to: '/scheduling/tailoring', icon: UsersRound },
    {
      label: 'Builder events',
      to: '/scheduling/builder-events',
      icon: CalendarClock,
    },
  ],
};

function isActivePath({ pathname, target }: IsActivePathInput): boolean {
  return pathname === target || pathname.startsWith(`${target}/`);
}

function isOpaqueIdSegment({ segment }: IsOpaqueIdSegmentInput): boolean {
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment);
}

function toBreadcrumbLabel({ segment }: ToBreadcrumbLabelInput): string {
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

function findActiveNavBranch({
  pathname,
  items,
}: FindActiveNavBranchInput): ActiveNavBranch {
  for (const item of items) {
    if (!isActivePath({ pathname, target: item.to })) {
      continue;
    }

    const activeChild =
      item.children?.find((child) =>
        isActivePath({ pathname, target: child.to }),
      ) ?? null;

    return { item, child: activeChild };
  }

  return { item: null, child: null };
}

function formatNavLabel({ itemLabel, childLabel }: NavLabelInput): string {
  return childLabel ? `${itemLabel}: ${childLabel}` : itemLabel;
}

export function AppShell({ children, breadcrumbOverrides }: AppShellProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = React.useState(false);
  const location = useLocation();
  const { canSeeScheduling } = useCallerRoles();
  const navItems: NavItem[] = canSeeScheduling
    ? [...BASE_NAV_ITEMS, SCHEDULING_NAV_ITEM]
    : BASE_NAV_ITEMS;
  const activeBranch = findActiveNavBranch({
    pathname: location.pathname,
    items: navItems,
  });
  const currentSectionLabel = activeBranch.item
    ? formatNavLabel({
        itemLabel: activeBranch.item.label,
        childLabel: activeBranch.child?.label ?? null,
      })
    : null;
  const mobileSubtitle = currentSectionLabel ?? 'Calm scheduling';

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
      new Map(
        (breadcrumbOverrides ?? []).map((override) => [
          override.segment,
          override.label,
        ]),
      ),
    [breadcrumbOverrides],
  );
  const breadcrumbs: BreadcrumbItemModel[] = [
    { label: 'Home', to: '/', isLast: pathSegments.length === 0 },
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
              {mobileSubtitle}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPaletteOpen(true)}
            className="radius-icon flex h-11 w-11 items-center justify-center border border-sidebar-border bg-background/80 p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>

          <NotificationBell />

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
        <div
          className={`flex h-16 items-center border-sidebar-border border-b ${isCollapsed ? 'px-2' : 'px-4'}`}
        >
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
        </div>

        {/* Sidebar Nav */}
        <TooltipProvider delay={120}>
          <nav
            className={`flex-1 py-5 ${isCollapsed ? 'space-y-0.5 px-2' : 'space-y-1 px-3'}`}
          >
            {navItems.map((item) => {
              const isActive = isActivePath({
                pathname: location.pathname,
                target: item.to,
              });
              const activeChild =
                item.children?.find((child) =>
                  isActivePath({
                    pathname: location.pathname,
                    target: child.to,
                  }),
                ) ?? null;
              const tooltipLabel = formatNavLabel({
                itemLabel: item.label,
                childLabel: activeChild?.label ?? null,
              });
              const Icon = item.icon;

              // Collapsed rail: parent is a perfect square icon button (no
              // stacked padding from both `nav` and the link, which used to
              // push the 36px icon wider than the 64px collapsed rail).
              const collapsedParentLink = (
                <Link
                  to={item.to}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={tooltipLabel}
                  className={`radius-icon mx-auto flex h-10 w-10 shrink-0 items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : item.children
                        ? 'bg-sidebar-accent/70 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                </Link>
              );

              // No bg/border pill for the expanded state — active is
              // conveyed by icon + text color/weight only, per hover still
              // gets a light bg for interaction feedback (a different,
              // transient state, not the persistent "selected" look).
              const expandedParentLink = (
                <Link
                  to={item.to}
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
                  <motion.span
                    initial={false}
                    animate={{ opacity: 1, width: 'auto' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                </Link>
              );

              const childRow = (child: NavItem) => {
                const isChildActive = isActivePath({
                  pathname: location.pathname,
                  target: child.to,
                });
                const ChildIcon = child.icon;
                return (
                  <Link
                    key={child.to}
                    to={child.to}
                    aria-current={isChildActive ? 'page' : undefined}
                    className={`radius-surface flex items-center gap-2 px-2.5 py-2 text-sm transition-colors hover:bg-sidebar-accent ${
                      isChildActive
                        ? 'font-semibold text-primary'
                        : 'font-medium text-sidebar-foreground/70 hover:text-sidebar-accent-foreground'
                    }`}
                  >
                    <ChildIcon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isChildActive
                          ? 'text-primary'
                          : 'text-sidebar-foreground/55'
                      }`}
                    />
                    <span className="whitespace-nowrap">{child.label}</span>
                  </Link>
                );
              };

              const showChildren = Boolean(item.children);

              return (
                <div key={item.to} className={isCollapsed ? 'mb-1' : undefined}>
                  {isCollapsed ? (
                    <Tooltip>
                      <TooltipTrigger render={collapsedParentLink} />
                      <TooltipContent side="right">
                        {tooltipLabel}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    expandedParentLink
                  )}

                  {showChildren && isCollapsed ? (
                    <div className="mt-0.5 flex flex-col items-center gap-0.5">
                      {item.children?.map((child) => {
                        const isChildActive = isActivePath({
                          pathname: location.pathname,
                          target: child.to,
                        });
                        const ChildIcon = child.icon;
                        return (
                          <Tooltip key={child.to}>
                            <TooltipTrigger
                              render={
                                <Link
                                  to={child.to}
                                  aria-current={
                                    isChildActive ? 'page' : undefined
                                  }
                                  aria-label={child.label}
                                  className={`radius-icon flex h-7 w-7 shrink-0 items-center justify-center transition-colors ${
                                    isChildActive
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-background/60 text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                                  }`}
                                />
                              }
                            >
                              <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              {child.label}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  ) : null}

                  {showChildren && !isCollapsed ? (
                    // Parent icon center: link px-3 (12px) + half of the
                    // h-4.5 (18px) icon = 21px = left-5.25. The line starts
                    // at top-0 (the wrapper's own top, flush with the
                    // parent row's bottom edge) rather than reaching up to
                    // touch the icon itself — an 11px gap, same rule
                    // applied on the child side: each stub stops 11px
                    // short of the child icon's left edge (child icon
                    // center = wrapper pl-8 (32px) + child link px-2.5
                    // (10px) + half of h-3.5 (14px) = 49px, icon left edge
                    // = 42px, so the stub — starting at local -11px / outer
                    // 21px — runs to w-2.5 (10px), landing at outer 31px,
                    // 11px shy of 42). Same gap everywhere, deliberately
                    // consistent rather than flush.
                    <div className="relative mb-1 space-y-0.5 pl-8">
                      <div className="absolute top-0 bottom-4 left-5.25 w-px bg-sidebar-foreground/25" />
                      {item.children?.map((child) => (
                        <div key={child.to} className="relative">
                          <div className="absolute top-1/2 -left-2.75 h-px w-2.5 -translate-y-1/2 bg-sidebar-foreground/25" />
                          {childRow(child)}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
        </TooltipProvider>
      </motion.aside>

      {/* 3. Main Content Container */}
      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        {/* Desktop Topbar */}
        <header className="relative hidden h-16 shrink-0 items-center justify-between border-border/70 border-b bg-background/92 px-(--workspace-pad-x) backdrop-blur md:flex">
          {/* Sidebar toggle + Breadcrumbs */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              data-testid="sidebar-toggle"
              onClick={handleToggle}
              className="radius-icon flex h-8 w-8 shrink-0 items-center justify-center border border-border bg-card/88 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
            <ModeToggle />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto px-(--workspace-pad-x) py-(--workspace-pad-y)">
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
      <MobileDrawer
        open={isDrawerOpen}
        onOpenChange={handleDrawerOpenChange}
        title="Navigation"
        description="Move between your core workflows."
      >
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
                <div key={item.to}>
                  <Link
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

                  {item.children ? (
                    <div className="relative mt-0.5 space-y-0.5 pl-10">
                      <div
                        data-nav-connector-rail
                        aria-hidden="true"
                        className="absolute top-0 bottom-2 left-5 w-px bg-sidebar-foreground/20"
                      />
                      {item.children.map((child) => {
                        const isChildActive = isActivePath({
                          pathname: location.pathname,
                          target: child.to,
                        });
                        const ChildIcon = child.icon;
                        return (
                          <div
                            key={child.to}
                            data-nav-child
                            className="relative"
                          >
                            <div
                              data-nav-connector
                              aria-hidden="true"
                              className="absolute top-1/2 -left-5 h-px w-3 -translate-y-1/2 bg-sidebar-foreground/20"
                            />
                            <Link
                              to={child.to}
                              onClick={() => setIsDrawerOpen(false)}
                              className={`radius-surface flex h-11 items-center gap-2 border px-3 py-2 font-medium text-sm transition-colors ${
                                isChildActive
                                  ? 'border-primary/15 bg-primary/11 font-semibold text-foreground'
                                  : 'border-sidebar-border/55 text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                              }`}
                            >
                              <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                              <span>{child.label}</span>
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>

          <div className="flex items-center justify-between border-sidebar-border border-t pt-4">
            <span className="text-muted-foreground text-sm">Account</span>
            <UserMenu />
          </div>
        </div>
      </MobileDrawer>

      {/* 6. Command Palette */}
      <CommandPalette open={isPaletteOpen} onOpenChange={setIsPaletteOpen} />
    </div>
  );
}
