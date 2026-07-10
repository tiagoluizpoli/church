import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../__tests__/setup/render';
import { AppShell } from './app-shell';
import { useCallerRoles } from '@/shared/hooks/use-caller-roles';

let mockPathname = '/dashboard';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ({ pathname: mockPathname }),
  useNavigate: () => vi.fn(),
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

describe('AppShell role-scoped navigation', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockPathname = '/dashboard';
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
    'sub_leader',
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
      'Tailoring',
      'Builder events',
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
      'Tailoring',
      'Builder events',
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
  });

  it('renders a connector element for each child nav item under its parent section', async () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: true,
      isResolving: false,
    });

    renderWithProviders(<AppShell>content</AppShell>);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('mobile-drawer-trigger'));

    const drawerNav = (
      await screen.findByTestId('mobile-drawer-content')
    ).querySelector('nav') as HTMLElement;
    const childLink = within(drawerNav).getByRole('link', { name: 'Cycles' });
    const childRow = childLink.closest('[data-nav-child]');

    expect(childRow).not.toBeNull();
    expect(childRow?.querySelector('[data-nav-connector]')).not.toBeNull();
  });

  it('keeps every nav item navigating and highlighting exactly as before this change', async () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: true,
      isResolving: false,
    });
    mockPathname = '/scheduling/tailoring';

    renderWithProviders(<AppShell>content</AppShell>);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('mobile-drawer-trigger'));

    const drawerNav = (
      await screen.findByTestId('mobile-drawer-content')
    ).querySelector('nav') as HTMLElement;

    expect(navLabels(drawerNav)).toEqual([
      'Dashboard',
      'Availability',
      'Scheduling',
      'Cycles',
      'Tailoring',
      'Builder events',
    ]);

    const tailoringLink = within(drawerNav).getByRole('link', {
      name: 'Tailoring',
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
