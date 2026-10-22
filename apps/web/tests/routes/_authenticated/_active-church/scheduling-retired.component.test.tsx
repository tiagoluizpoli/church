import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const listCycles = vi.fn();
const getSession = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    listCycles: (...args: unknown[]) => listCycles(...args),
  },
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    signOut: vi.fn(),
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

vi.mock('@/features/volunteers/components/volunteer-dashboard', () => ({
  VolunteerDashboard: () => <div>Volunteer dashboard stub</div>,
}));

describe('/scheduling retired', () => {
  it('shows not-found with no redirect', async () => {
    renderRoute({ initialPath: '/scheduling', churchTimezone: 'UTC' });

    expect(await screen.findByText('Not Found')).toBeVisible();
  });

  it('redirects a planning-admin refusal to "/"', async () => {
    listCycles.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403 },
      message: 'Forbidden',
    });

    renderRoute({ initialPath: '/cycles', churchTimezone: 'UTC' });

    expect(await screen.findByText('Volunteer dashboard stub')).toBeVisible();
  });
});
