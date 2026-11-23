import { m } from '@church/i18n/messages';
import { screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeChurchApiMock,
  resolvedActiveChurchStatus,
} from '@/tests/setup/active-church';
import { mswServer } from '@/tests/setup/msw';
import { renderRoute } from '@/tests/setup/render-route';

const getSession = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    organization: {
      getActiveMember: vi.fn(),
    },
  },
}));

vi.mock('@/utils/api-instances', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/api-instances')>()),
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
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

describe('the session guard (app)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends an unauthenticated visitor to /login and preserves the intended destination', async () => {
    getSession.mockResolvedValue({ data: null });

    const { router } = renderRoute({ initialPath: '/app/no-access' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(router.state.location.search).toEqual({
      redirect: '/app/no-access',
    });
  });

  it('lets an authenticated visitor through to the destination', async () => {
    getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });

    renderRoute({ initialPath: '/app/no-access' });

    expect(await screen.findByText(m.no_access_title())).toBeInTheDocument();
  });

  describe('when the server cannot be reached', () => {
    const READINESS = 'http://localhost:3000/api/health';

    function serverIsDown() {
      mswServer.use(http.get(READINESS, () => HttpResponse.error()));
    }

    function serverIsBack() {
      mswServer.use(http.get(READINESS, () => HttpResponse.json({ ok: true })));
    }

    beforeEach(() => {
      activeChurchApiMock.getActiveChurchStatus.mockResolvedValue(
        resolvedActiveChurchStatus(),
      );
    });

    it.each([
      [
        'a network error',
        () => Promise.reject(new TypeError('Failed to fetch')),
      ],
      [
        'a 503 answer',
        () => Promise.resolve({ data: null, error: { status: 503 } }),
      ],
      [
        'a 500 answer',
        () => Promise.resolve({ data: null, error: { status: 500 } }),
      ],
    ])('shows the reconnecting state, not the login page, after %s on the session call', async (_name, failure) => {
      serverIsDown();
      getSession.mockImplementation(failure);

      const { router } = renderRoute({ initialPath: '/app/no-access' });

      // The banner's empty live region is a status too: find this one by text.
      const title = await screen.findByText(m.shell_reconnecting_title());
      expect(title.closest('[role="status"]')).toHaveTextContent(
        m.shell_reconnecting_description(),
      );
      expect(router.state.location.pathname).not.toBe('/login');
    });

    it('lands on the requested page once the server is back', async () => {
      serverIsDown();
      getSession.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });

      const { router } = renderRoute({ initialPath: '/app/no-access' });
      await screen.findByText(m.shell_reconnecting_title());

      serverIsBack();
      window.dispatchEvent(new Event('online'));

      expect(await screen.findByText(m.no_access_title())).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/app/no-access');
    });

    it('shows the reconnecting state when the active church cannot be resolved, and recovers', async () => {
      serverIsDown();
      getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });
      activeChurchApiMock.getActiveChurchStatus.mockRejectedValueOnce(
        new AxiosError('Network Error'),
      );

      renderRoute({ initialPath: '/app' });
      await screen.findByText(m.shell_reconnecting_title());

      serverIsBack();
      window.dispatchEvent(new Event('online'));

      await waitFor(() => {
        expect(
          screen.queryByText(m.shell_reconnecting_title()),
        ).not.toBeInTheDocument();
      });
    });

    it('shows the reconnecting state when a cross-church deep link cannot list churches, then lands on the link', async () => {
      serverIsDown();
      getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });
      activeChurchApiMock.getActiveChurchStatus.mockResolvedValue({
        status: 'selection_required',
      });
      activeChurchApiMock.listActiveChurchOptions.mockRejectedValue(
        new AxiosError('Network Error'),
      );
      activeChurchApiMock.selectActiveChurch.mockResolvedValue(
        resolvedActiveChurchStatus({ churchId: 'church-2' }),
      );

      const { router } = renderRoute({ initialPath: '/app?church=church-2' });
      await screen.findByText(m.shell_reconnecting_title());

      activeChurchApiMock.listActiveChurchOptions.mockResolvedValue({
        churches: [{ churchId: 'church-2', name: 'Second Church' }],
      });
      serverIsBack();
      window.dispatchEvent(new Event('online'));

      await waitFor(() => {
        expect(activeChurchApiMock.selectActiveChurch).toHaveBeenCalledWith({
          churchId: 'church-2',
        });
      });
      await waitFor(() => {
        expect(
          screen.queryByText(m.shell_reconnecting_title()),
        ).not.toBeInTheDocument();
      });
      expect(router.state.location.pathname).toBe('/app');
      expect(router.state.location.search).toEqual({ church: 'church-2' });
    });

    it('still shows the ordinary error fallback for a non-outage failure', async () => {
      getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });
      activeChurchApiMock.getActiveChurchStatus.mockRejectedValue(
        new Error('boom'),
      );

      renderRoute({ initialPath: '/app' });

      expect(
        await screen.findByText(m.shell_error_title()),
      ).toBeInTheDocument();
    });
  });
});
