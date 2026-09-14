import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildrenProps } from '@/__tests__/setup/children-props';
import { renderRoute } from '@/__tests__/setup/render-route';

const getSession = vi.fn();
const getVolunteerDashboard = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    useSession: () => ({ isPending: false }),
    organization: {
      getActiveMember: vi.fn(),
    },
  },
}));

vi.mock('@/utils/api-instances', async () => ({
  volunteerApi: {
    getVolunteerDashboard: (...args: unknown[]) =>
      getVolunteerDashboard(...args),
  },
  activeChurchApi: (await import('@/__tests__/setup/active-church'))
    .activeChurchApiMock,
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

describe('the sign-in route (login)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders standalone for an unauthenticated visitor, with no redirect', async () => {
    getSession.mockResolvedValue({ data: null });

    const { router } = renderRoute({
      initialPath: '/login',
      churchTimezone: 'UTC',
    });

    expect(await screen.findByText('Welcome Back')).toBeVisible();
    expect(screen.getByText(/access is invitation-only/i)).toBeVisible();
    expect(screen.queryByText('Create Account')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Need an account? Sign Up'),
    ).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('redirects an already-authenticated visitor onward to the dashboard by default', async () => {
    getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });
    getVolunteerDashboard.mockResolvedValue({
      availabilityTasks: [],
      upcomingAssignmentGroups: [],
      unreadNotificationCount: 0,
      notificationPreview: [],
      defaultMinistryId: undefined,
      ministryOptions: [],
    });

    const { router } = renderRoute({
      initialPath: '/login',
      churchTimezone: 'UTC',
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
  });

  it('honors a validated same-origin redirect target', async () => {
    getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });

    const { router } = renderRoute({
      initialPath: '/login?redirect=%2Fno-access',
      churchTimezone: 'UTC',
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/no-access');
    });
    expect(await screen.findByText('No Church access')).toBeVisible();
  });

  it('falls back to the dashboard when the redirect target is rejected', async () => {
    getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });
    getVolunteerDashboard.mockResolvedValue({
      availabilityTasks: [],
      upcomingAssignmentGroups: [],
      unreadNotificationCount: 0,
      notificationPreview: [],
      defaultMinistryId: undefined,
      ministryOptions: [],
    });

    const { router } = renderRoute({
      initialPath: '/login?redirect=https%3A%2F%2Fevil.example%2Fx',
      churchTimezone: 'UTC',
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
  });
});
