import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../__tests__/setup/render';
import { AppShell } from './app-shell';
import { useCallerRoles } from '@/shared/hooks/use-caller-roles';

let mockPathname = '/dashboard';
let mockHref = '/dashboard';
const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ({ pathname: mockPathname, href: mockHref }),
  useNavigate: () => mockNavigate,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false }),
  },
}));

vi.mock('@/shared/hooks/use-caller-roles', () => ({
  useCallerRoles: vi.fn(),
}));

const mockedUseCallerRoles = vi.mocked(useCallerRoles);

// CommandPalette (rendered but closed by default) probes viewport width on
// mount; jsdom has no real matchMedia implementation.
window.matchMedia =
  window.matchMedia ??
  ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

function navLabels(landmark: HTMLElement): (string | undefined)[] {
  return within(landmark)
    .getAllByRole('link')
    .map((link) => link.textContent?.trim());
}

async function findDrawerNav(): Promise<HTMLElement> {
  const drawer = await screen.findByTestId('mobile-drawer-content');
  return within(drawer).getByRole('navigation');
}

// h-12 = 12 * 4px = 48px against this repo's unmodified default Tailwind
// spacing scale (`--spacing: 0.25rem`, see src/index.css — no override),
// at or above the 44px touch-target minimum.
const TOUCH_TARGET_HEIGHT_CLASS = /\bh-12\b/;

describe('AppShell role-scoped navigation', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockPathname = '/dashboard';
    mockHref = '/dashboard';
  });

  it('shows only Dashboard and Availability for a Volunteer-only caller', () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: false,
      isResolving: false,
    });

    renderWithProviders(<AppShell>content</AppShell>);

    expect(navLabels(screen.getByTestId('sidebar'))).toEqual([
      'Dashboard',
      'Availability',
    ]);
    expect(navLabels(screen.getByTestId('mobile-bottom-nav'))).toEqual([
      'Dashboard',
      'Availability',
    ]);
  });

  it.each([
    'leader',
    'TeamLeader',
    'admin',
  ])('additionally shows Scheduling for a %s caller', () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: true,
      isResolving: false,
    });
    mockPathname = '/scheduling';

    renderWithProviders(<AppShell>content</AppShell>);

    expect(navLabels(screen.getByTestId('sidebar'))).toEqual([
      'Dashboard',
      'Availability',
      'Scheduling',
      'Cycles',
      'Rostering',
    ]);
    expect(navLabels(screen.getByTestId('mobile-bottom-nav'))).toEqual([
      'Dashboard',
      'Availability',
      'Scheduling',
    ]);
  });

  it('keeps Scheduling children visible and navigable when a different section is active', () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: true,
      isResolving: false,
    });
    mockPathname = '/dashboard';

    renderWithProviders(<AppShell>content</AppShell>);

    expect(navLabels(screen.getByTestId('sidebar'))).toEqual([
      'Dashboard',
      'Availability',
      'Scheduling',
      'Cycles',
      'Rostering',
    ]);
  });

  it.each([
    false,
    true,
  ])('never renders Shifts, Alerts, Profile, or Todos when canSeeScheduling is %s', (canSeeScheduling) => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling,
      isResolving: false,
    });

    renderWithProviders(<AppShell>content</AppShell>);

    for (const staleLabel of ['Shifts', 'Alerts', 'Profile', 'Todos']) {
      expect(screen.queryAllByRole('link', { name: staleLabel })).toHaveLength(
        0,
      );
    }
  });

  it('shows a caller-supplied breadcrumb override in place of the raw id segment', () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: true,
      isResolving: false,
    });
    mockPathname = '/scheduling/planning-cycles/cycle-1';

    renderWithProviders(
      <AppShell
        breadcrumbOverrides={[{ segment: 'cycle-1', label: 'August 2026' }]}
      >
        content
      </AppShell>,
    );

    const breadcrumbs = screen.getByTestId('breadcrumbs');
    expect(within(breadcrumbs).getByText('Planning cycles')).toBeVisible();
    expect(within(breadcrumbs).getByText('August 2026')).toBeVisible();
  });

  it('hides an opaque id segment from breadcrumbs when no override is supplied', () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: true,
      isResolving: false,
    });
    mockPathname = '/scheduling/planning-cycles/cycle-1';

    renderWithProviders(<AppShell>content</AppShell>);

    const breadcrumbs = screen.getByTestId('breadcrumbs');
    expect(within(breadcrumbs).getByText('Planning cycles')).toBeVisible();
    expect(within(breadcrumbs).queryByText('cycle-1')).not.toBeInTheDocument();
  });
});

describe('AppShell mobile nav drawer hierarchy (US4, 021)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockPathname = '/dashboard';
    mockHref = '/dashboard';
  });

  it('renders a connector element for each child nav item under its parent section', async () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: true,
      isResolving: false,
    });

    renderWithProviders(<AppShell>content</AppShell>);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('mobile-drawer-trigger'));

    const drawerNav = await findDrawerNav();
    const childLink = within(drawerNav).getByRole('link', { name: 'Cycles' });
    const childRow = childLink.closest('[data-nav-child]');

    expect(childRow).not.toBeNull();
    expect(childRow?.querySelector('[data-nav-connector]')).not.toBeNull();
  });

  it('keeps the remaining scheduling navigation items navigable and highlighted', async () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: true,
      isResolving: false,
    });
    mockPathname = '/scheduling/tailoring';

    renderWithProviders(<AppShell>content</AppShell>);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('mobile-drawer-trigger'));

    const drawerNav = await findDrawerNav();

    expect(navLabels(drawerNav)).toEqual([
      'Dashboard',
      'Availability',
      'Scheduling',
      'Cycles',
      'Rostering',
    ]);

    const tailoringLink = within(drawerNav).getByRole('link', {
      name: 'Rostering',
    });
    expect(tailoringLink).toHaveClass('font-semibold');
    expect(tailoringLink).toHaveAttribute('href', '/scheduling/tailoring');

    const cyclesLink = within(drawerNav).getByRole('link', {
      name: 'Cycles',
    });
    expect(cyclesLink).not.toHaveClass('font-semibold');
    expect(cyclesLink).toHaveAttribute('href', '/scheduling/planning-cycles');
  });
});

describe('AppShell desktop sidebar collapse (#219, right-sized from desktop-layout.spec.ts)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockPathname = '/dashboard';
    mockHref = '/dashboard';
  });

  it('flips the toggle label and collapsed markup on each click, round-tripping back to expanded', async () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: false,
      isResolving: false,
    });

    renderWithProviders(<AppShell>content</AppShell>);
    const user = userEvent.setup();
    const toggle = screen.getByTestId('sidebar-toggle');

    const sidebar = screen.getByTestId('sidebar');

    // Expanded: full title block, toggle offers to collapse.
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBe(
      toggle,
    );
    expect(within(sidebar).getByText('Church CRM')).toBeVisible();

    await user.click(toggle);

    // Collapsed: title block replaced by the icon-only header, toggle now
    // offers to expand — the same signal desktop-layout.spec.ts inferred
    // from the sidebar's animated boundingBox width.
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBe(toggle);
    expect(within(sidebar).queryByText('Church CRM')).not.toBeInTheDocument();

    await user.click(toggle);

    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBe(
      toggle,
    );
    expect(within(sidebar).getByText('Church CRM')).toBeVisible();
  });
});

describe('AppShell responsive visibility contract (#219, right-sized from mobile-layout.spec.ts)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockPathname = '/dashboard';
    mockHref = '/dashboard';
  });

  it('hides the desktop sidebar and shows the mobile shell below md, and the reverse above it', () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: false,
      isResolving: false,
    });

    renderWithProviders(<AppShell>content</AppShell>);

    // jsdom has no real breakpoint layout, so this asserts the Tailwind
    // class contract each element ships (hidden below/above `md`) rather
    // than a rendered boundingBox — the same source that made the real
    // browser hide/show them.
    expect(screen.getByTestId('sidebar').className).toContain('md:flex');
    expect(screen.getByTestId('sidebar').className).toContain('hidden');
    expect(screen.getByTestId('mobile-top-header').className).toContain(
      'md:hidden',
    );
    expect(screen.getByTestId('mobile-bottom-nav').className).toContain(
      'md:hidden',
    );
  });

  it('only links to routes that exist in the bottom nav and drawer for a Volunteer-only caller', async () => {
    const VOLUNTEER_ALLOWED_HREFS = ['/dashboard', '/availability'];
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: false,
      isResolving: false,
    });

    renderWithProviders(<AppShell>content</AppShell>);
    const user = userEvent.setup();

    for (const link of within(
      screen.getByTestId('mobile-bottom-nav'),
    ).getAllByRole('link')) {
      expect(VOLUNTEER_ALLOWED_HREFS).toContain(link.getAttribute('href'));
    }

    await user.click(screen.getByTestId('mobile-drawer-trigger'));
    const drawerNav = await findDrawerNav();
    for (const link of within(drawerNav).getAllByRole('link')) {
      expect(VOLUNTEER_ALLOWED_HREFS).toContain(link.getAttribute('href'));
    }
  });

  it('sizes bottom-nav and drawer links at or above the 44px touch-target minimum', async () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: false,
      isResolving: false,
    });

    renderWithProviders(<AppShell>content</AppShell>);
    const user = userEvent.setup();

    // jsdom has no layout engine, so boundingBox() (what mobile-layout.spec.ts
    // used) can't be reproduced here — this asserts the Tailwind height class
    // that actually produced that pixel size in the real browser instead
    // (TOUCH_TARGET_HEIGHT_CLASS above).
    for (const link of within(
      screen.getByTestId('mobile-bottom-nav'),
    ).getAllByRole('link')) {
      expect(link.className).toMatch(TOUCH_TARGET_HEIGHT_CLASS);
    }

    await user.click(screen.getByTestId('mobile-drawer-trigger'));
    const drawerNav = await findDrawerNav();
    for (const link of within(drawerNav).getAllByRole('link')) {
      expect(link.className).toMatch(TOUCH_TARGET_HEIGHT_CLASS);
    }
  });
});

describe('AppShell command palette shortcut (#219, right-sized from search.spec.ts)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockPathname = '/dashboard';
    mockHref = '/dashboard';
  });

  it('opens the command palette on Ctrl+K and closes it on a second press', async () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: false,
      isResolving: false,
    });

    renderWithProviders(<AppShell>content</AppShell>);

    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();

    await userEvent.keyboard('{Control>}k{/Control}');
    expect(await screen.findByTestId('command-palette')).toBeVisible();

    await userEvent.keyboard('{Control>}k{/Control}');
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
  });
});

describe('AppShell Switch Church control', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockPathname = '/dashboard';
    mockHref = '/dashboard';
  });

  it('navigates to select-church with the full path, query, and hash preserved as the redirect target', async () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: true,
      isResolving: false,
    });
    mockPathname = '/scheduling/planning-cycles';
    mockHref = '/scheduling/planning-cycles?view=board#upcoming';

    renderWithProviders(<AppShell>content</AppShell>);
    const user = userEvent.setup();
    await user.click(
      within(screen.getByTestId('sidebar')).getByRole('button', {
        name: 'Switch Church',
      }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/select-church?redirect=%2Fscheduling%2Fplanning-cycles%3Fview%3Dboard%23upcoming',
    });
  });

  it('navigates to select-church from the mobile drawer and closes the drawer', async () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: false,
      isResolving: false,
    });
    mockHref = '/dashboard';

    renderWithProviders(<AppShell>content</AppShell>);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('mobile-drawer-trigger'));
    const drawer = await screen.findByTestId('mobile-drawer-content');

    await user.click(
      within(drawer).getByRole('button', { name: 'Switch Church' }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/select-church?redirect=%2Fdashboard',
    });
  });

  it('keeps the Switch Church control reachable and functional when the sidebar is collapsed', async () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: false,
      isResolving: false,
    });
    mockHref = '/dashboard';

    renderWithProviders(<AppShell>content</AppShell>);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('sidebar-toggle'));

    const switchChurchButton = within(screen.getByTestId('sidebar')).getByRole(
      'button',
      { name: 'Switch Church' },
    );
    expect(
      switchChurchButton.querySelector('.lucide-users-round'),
    ).not.toBeNull();

    await user.click(switchChurchButton);

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/select-church?redirect=%2Fdashboard',
    });
  });
});
