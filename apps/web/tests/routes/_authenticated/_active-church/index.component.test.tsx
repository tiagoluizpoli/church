import { m } from '@church/i18n/messages';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activeChurchApiMock } from '@/tests/setup/active-church';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

// Home (`/`) is the common entry: it renders the existing dashboard content
// in place and defers Church resolution to the shared entry gate.

const getSession = vi.fn();
const toastWarning = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: {
    warning: toastWarning,
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    signOut: vi.fn(),
  },
}));

vi.mock('@/utils/api-instances', async () => ({
  activeChurchApi: (await import('@/tests/setup/active-church'))
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

vi.mock('@/features/volunteers/components/volunteer-dashboard', () => ({
  VolunteerDashboard: () => <div>Volunteer dashboard stub</div>,
}));

describe('_active-church index route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { user: { id: 'u1', name: 'Any Caller' }, session: {} },
    });
  });

  it('renders Home at "/" without cycling through /dashboard', async () => {
    const { router } = renderRoute({ initialPath: '/', churchTimezone: 'UTC' });

    expect(await screen.findByText('Volunteer dashboard stub')).toBeVisible();
    expect(router.state.location.pathname).toBe('/');
  });

  it('sends a caller who must choose a Church to /select-church', async () => {
    activeChurchApiMock.getActiveChurchStatus.mockResolvedValue({
      status: 'selection_required',
    });
    activeChurchApiMock.listActiveChurchOptions.mockResolvedValue({
      churches: [],
    });

    const { router } = renderRoute({ initialPath: '/' });

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/select-church'),
    );
  });

  it('sends a caller with no membership to /no-access', async () => {
    activeChurchApiMock.getActiveChurchStatus.mockResolvedValue({
      status: 'no_membership',
    });

    const { router } = renderRoute({ initialPath: '/' });

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/no-access'),
    );
  });

  it('shows the Church-only warning carried in navigation state', async () => {
    renderRoute({
      initialPath: '/?joinedChurch=St.%20Peter&invitedMinistry=Youth',
      churchTimezone: 'UTC',
    });

    await waitFor(() =>
      expect(toastWarning).toHaveBeenCalledWith(
        m.home_church_only_warning({
          churchName: 'St. Peter',
          ministryName: 'Youth',
        }),
      ),
    );
  });
});
