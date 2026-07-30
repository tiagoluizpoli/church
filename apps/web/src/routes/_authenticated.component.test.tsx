import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/__tests__/setup/render-route';

const getSession = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    organization: {
      getActiveMember: vi.fn(),
    },
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

describe('the session guard (_authenticated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends an unauthenticated visitor to /login and preserves the intended destination', async () => {
    getSession.mockResolvedValue({ data: null });

    const { router } = renderRoute({ initialPath: '/no-access' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(router.state.location.search).toEqual({ redirect: '/no-access' });
  });

  it('lets an authenticated visitor through to the destination', async () => {
    getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });

    renderRoute({ initialPath: '/no-access' });

    expect(await screen.findByText('No Church access')).toBeInTheDocument();
  });
});
