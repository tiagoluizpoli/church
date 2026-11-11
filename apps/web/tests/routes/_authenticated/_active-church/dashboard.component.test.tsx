import { m } from '@church/i18n/messages';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callerCapabilitiesApiMock } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

// `/dashboard` is only a compatibility redirect to Home (`/`).

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({
      data: { user: { id: 'u1', name: 'Dual Member' }, session: {} },
    }),
    signOut: vi.fn(),
  },
}));

vi.mock('@/utils/api-instances', async () => ({
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
  callerCapabilitiesApi: (await import('@/tests/setup/caller-capabilities'))
    .callerCapabilitiesApiMock,
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

describe('dashboard route', () => {
  beforeEach(() => {
    callerCapabilitiesApiMock.getCallerCapabilities.mockReturnValue(
      new Promise(() => {}),
    );
  });

  it('redirects to Home, carrying the supported search context', async () => {
    const { router } = renderRoute({
      initialPath:
        '/dashboard?removedFrom=Old+Church&accessDenied=true&joinedChurch=St.+Peter&invitedMinistry=Youth',
      churchTimezone: 'UTC',
    });

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toEqual({
      removedFrom: 'Old Church',
      accessDenied: true,
      joinedChurch: 'St. Peter',
      invitedMinistry: 'Youth',
    });
    expect(
      await screen.findByText(
        m.no_access_removed_from({ churchName: 'Old Church' }),
      ),
    ).toBeVisible();
  });
});
