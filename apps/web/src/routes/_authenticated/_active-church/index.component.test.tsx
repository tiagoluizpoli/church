import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildrenProps } from '@/__tests__/setup/children-props';
import { renderRoute } from '@/__tests__/setup/render-route';

// #219, right-sized from home-landing.spec.ts: the home landing surface
// itself (no leftover banner, no duplicate Events list) is proven at the
// dashboard component in volunteer-dashboard-tabs.component.test.tsx — this
// test proves only the redirect this route contributes, which the real
// browser flow depends on to land there in the first place.

const getSession = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    signOut: vi.fn(),
  },
}));

vi.mock('@/utils/api-instances', async () => ({
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

  it('redirects "/" straight to "/dashboard" regardless of caller role', async () => {
    renderRoute({ initialPath: '/', churchTimezone: 'UTC' });

    expect(await screen.findByText('Volunteer dashboard stub')).toBeVisible();
  });
});
