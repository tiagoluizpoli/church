import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/__tests__/setup/render-route';

const getSession = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    signOut: vi.fn(),
  },
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));

describe('no-access route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { user: { id: 'u1' }, session: {} },
    });
  });

  it('shows generic copy on a plain, unprompted visit', async () => {
    renderRoute({ initialPath: '/no-access' });

    expect(await screen.findByText('No Church access')).toBeVisible();
    expect(
      screen.getByText(/isn't currently linked to an active Church/i),
    ).toBeVisible();
  });

  it('names the former Church when redirected here with removedFrom', async () => {
    renderRoute({ initialPath: '/no-access?removedFrom=Igreja+Central' });

    expect(await screen.findByText('No Church access')).toBeVisible();
    expect(screen.getByText(/no longer have access to/i)).toBeVisible();
    expect(screen.getByText('Igreja Central')).toBeVisible();
  });
});
