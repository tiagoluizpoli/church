import { m } from '@church/i18n/messages';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authClient } from '@/lib/auth-client';
import { renderRoute } from '@/tests/setup/render-route';

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

describe('no-access route (F10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { user: { id: 'u1' }, session: {} },
    });
  });

  it('shows generic copy on a plain, unprompted visit', async () => {
    renderRoute({ initialPath: '/no-access' });

    expect(await screen.findByText(m.no_access_title())).toBeVisible();
    expect(screen.getByText(m.no_access_generic_body())).toBeVisible();
  });

  it('names the former Church when redirected here with removedFrom', async () => {
    renderRoute({ initialPath: '/no-access?removedFrom=Igreja+Central' });

    expect(await screen.findByText(m.no_access_title())).toBeVisible();
    expect(screen.getByText(/no longer have access to/i)).toBeVisible();
    expect(screen.getByText('Igreja Central')).toBeVisible();
  });

  it('calls sign out when the Sign out button is clicked', async () => {
    renderRoute({ initialPath: '/no-access' });

    await screen.findByText(m.no_access_title());

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: m.no_access_sign_out() }),
    );

    await waitFor(() => expect(authClient.signOut).toHaveBeenCalled());
  });
});
