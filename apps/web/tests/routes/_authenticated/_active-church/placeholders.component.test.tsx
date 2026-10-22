import { m } from '@church/i18n/messages';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetCallerCapabilities200 } from '@/infrastructure/api/churchAPI.schemas';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  callerCapabilitiesApi: {
    getCallerCapabilities: (...args: unknown[]) =>
      getCallerCapabilities(...args),
  },
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'u1' }, session: {} } }),
  },
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

function signInAs(capabilities: GetCallerCapabilities200) {
  getCallerCapabilities.mockResolvedValue(capabilities);
}

describe('coming-soon placeholder routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses /ministries to a Volunteer with the no-access state', async () => {
    signInAs(callerCapabilitiesFixture({ hasVolunteerMembership: true }));

    renderRoute({ initialPath: '/ministries', churchTimezone: 'UTC' });

    expect(await screen.findByText(m.shell_no_access())).toBeVisible();
    expect(screen.queryByText(m.shell_coming_soon())).not.toBeInTheDocument();
  });

  it.each([
    ['/ministries', m.nav_ministries()],
    ['/people', m.nav_people()],
    ['/invitations', m.nav_invitations()],
  ])('shows %s as coming soon to a Ministry leader', async (path, title) => {
    signInAs(callerCapabilitiesFixture({ ledMinistries: 1 }));

    renderRoute({ initialPath: path, churchTimezone: 'UTC' });

    expect(await screen.findByRole('heading', { name: title })).toBeVisible();
    expect(screen.getByText(m.shell_coming_soon())).toBeVisible();
  });

  it('shows /people as coming soon to a ChurchAdmin who leads nothing', async () => {
    signInAs(callerCapabilitiesFixture({ isChurchAdmin: true }));

    renderRoute({ initialPath: '/people', churchTimezone: 'UTC' });

    expect(await screen.findByText(m.shell_coming_soon())).toBeVisible();
  });

  it('tells a Church Member without a Volunteer membership they do not serve yet', async () => {
    signInAs(callerCapabilitiesFixture());

    renderRoute({ initialPath: '/my-schedule', churchTimezone: 'UTC' });

    expect(await screen.findByText(m.shell_not_serving())).toBeVisible();
    expect(screen.queryByText(m.shell_coming_soon())).not.toBeInTheDocument();
  });

  it('shows /my-schedule as coming soon to a Volunteer', async () => {
    signInAs(callerCapabilitiesFixture({ hasVolunteerMembership: true }));

    renderRoute({ initialPath: '/my-schedule', churchTimezone: 'UTC' });

    expect(
      await screen.findByRole('heading', { name: m.nav_my_schedule() }),
    ).toBeVisible();
    expect(screen.getByText(m.shell_coming_soon())).toBeVisible();
  });

  it('shows neither refusal while the capabilities load', async () => {
    getCallerCapabilities.mockReturnValue(new Promise(() => {}));

    renderRoute({ initialPath: '/ministries', churchTimezone: 'UTC' });

    expect(await screen.findByTestId('capability-gate-skeleton')).toBeVisible();
    expect(screen.queryByText(m.shell_no_access())).not.toBeInTheDocument();
    expect(screen.queryByText(m.shell_not_serving())).not.toBeInTheDocument();
  });

  it('keeps the public Church invitation route resolving beside the placeholder', async () => {
    const { router } = renderRoute({
      initialPath: '/invitations',
      churchTimezone: 'UTC',
    });
    await screen.findByTestId('capability-gate-skeleton');

    const paths = router
      .matchRoutes('/invitations/church/abc')
      .map((r) => r.routeId);
    expect(paths).toContain('/invitations/church/$invitationId');
    expect(
      router.matchRoutes('/invitations/ministry/abc').map((r) => r.routeId),
    ).toContain('/_authenticated/invitations/ministry/$invitationId');
  });
});
