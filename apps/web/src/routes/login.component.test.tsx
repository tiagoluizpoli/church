import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('@/utils/api-instances', () => ({
  volunteerApi: {
    getVolunteerDashboard: (...args: unknown[]) =>
      getVolunteerDashboard(...args),
  },
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
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

    const { router } = renderRoute({ initialPath: '/login' });

    expect(await screen.findByText('Create Account')).toBeVisible();
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

    const { router } = renderRoute({ initialPath: '/login' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
  });

  it('honors a validated same-origin redirect target', async () => {
    getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });

    const { router } = renderRoute({
      initialPath: '/login?redirect=%2Fno-access',
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
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
  });
});
