import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/__tests__/setup/render-route';
import { formatInTZ, getBrowserTimezone } from '@/shared/utils/date';

interface ChildrenProps {
  children: ReactNode;
}

/**
 * 12:00 UTC — 09:00 in São Paulo, 21:00 in Tokyo, and already 5 Jan 01:00 in
 * Pacific/Auckland, the ambient zone `vitest.config.ts` pins for this suite.
 */
const PROBE_INSTANT = '2027-01-04T12:00:00.000Z';
const PROBE_FORMAT = 'yyyy-MM-dd HH:mm';

const getSession = vi.fn();
const getActiveChurchStatus = vi.fn();
const listPlanningCycles = vi.fn();
const listActiveChurchOptions = vi.fn();
const selectActiveChurch = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    signOut: vi.fn(),
  },
}));

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listPlanningCycles: (...args: unknown[]) => listPlanningCycles(...args),
  },
  activeChurchApi: {
    getActiveChurchStatus: (...args: unknown[]) =>
      getActiveChurchStatus(...args),
    listActiveChurchOptions: (...args: unknown[]) =>
      listActiveChurchOptions(...args),
    selectActiveChurch: (...args: unknown[]) => selectActiveChurch(...args),
  },
}));

// The shell sits under the layout's TimezoneProvider like every real
// consumer, so it doubles as a probe rendering an actual time through it.
vi.mock('@/components/app-shell', async () => {
  const { useTimezone } = await import('@/shared/hooks/use-timezone');
  function AppShellProbe({ children }: ChildrenProps) {
    return (
      <>
        <span data-testid="church-time">
          {useTimezone().format(PROBE_INSTANT, PROBE_FORMAT)}
        </span>
        {children}
      </>
    );
  }
  return { AppShell: AppShellProbe };
});

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

function renderPlanningCycles() {
  return renderRoute({ initialPath: '/scheduling/planning-cycles' });
}

describe('the Active Church guard (_active-church)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The Church/Local Time toggle persists its mode; Local Time would read
    // the ambient zone and hide whether the Church Timezone was applied.
    localStorage.clear();
    listActiveChurchOptions.mockResolvedValue({ churches: [] });
  });

  describe('Church Timezone (#150)', () => {
    beforeEach(() => {
      getSession.mockResolvedValue({
        data: {
          user: { id: 'u1' },
          session: { activeOrganizationId: 'church-1' },
        },
      });
      listPlanningCycles.mockResolvedValue({ cycles: [] });
    });

    it("renders times in the Active Church's zone, not the ambient one", async () => {
      // Guards the premise: were the ambient zone São Paulo, this test could
      // pass without the Church Timezone ever being applied.
      expect(
        formatInTZ(PROBE_INSTANT, getBrowserTimezone(), PROBE_FORMAT),
      ).not.toBe('2027-01-04 09:00');
      getActiveChurchStatus.mockResolvedValue({
        status: 'resolved',
        churchId: 'church-1',
        timezone: 'America/Sao_Paulo',
      });

      renderPlanningCycles();

      expect(await screen.findByTestId('church-time')).toHaveTextContent(
        '2027-01-04 09:00',
      );
    });

    it('renders times in the new zone after switching to a Church elsewhere', async () => {
      const user = userEvent.setup();
      const tokyoStatus = {
        status: 'resolved',
        churchId: 'church-2',
        timezone: 'Asia/Tokyo',
      };
      getActiveChurchStatus.mockResolvedValue({
        status: 'resolved',
        churchId: 'church-1',
        timezone: 'America/Sao_Paulo',
      });
      listActiveChurchOptions.mockResolvedValue({
        churches: [
          {
            churchId: 'church-1',
            name: 'Igreja Central',
            timezone: 'America/Sao_Paulo',
            accessLevel: 'admin',
            availableAreas: ['dashboard', 'scheduling'],
            lastOpenedAt: null,
          },
          {
            churchId: 'church-2',
            name: 'Tokyo Church',
            timezone: 'Asia/Tokyo',
            accessLevel: 'admin',
            availableAreas: ['dashboard', 'scheduling'],
            lastOpenedAt: null,
          },
        ],
      });
      selectActiveChurch.mockImplementation(async () => {
        // The server records the switch on the session, so the entry gate
        // resolves the new Church from here on.
        getActiveChurchStatus.mockResolvedValue(tokyoStatus);
        return tokyoStatus;
      });

      const { router } = renderPlanningCycles();
      expect(await screen.findByTestId('church-time')).toHaveTextContent(
        '2027-01-04 09:00',
      );

      // A link into the other Church asks once, then switches for real.
      await act(() =>
        router.history.push('/scheduling/planning-cycles?church=church-2'),
      );
      await user.click(
        await screen.findByRole('button', { name: /switch to tokyo church/i }),
      );

      await waitFor(() => {
        expect(screen.getByTestId('church-time')).toHaveTextContent(
          '2027-01-04 21:00',
        );
      });
      expect(router.state.location.pathname).toBe(
        '/scheduling/planning-cycles',
      );
    });

    it('fails the route instead of guessing a zone when a resolved status carries none', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      getActiveChurchStatus.mockResolvedValue({
        status: 'resolved',
        churchId: 'church-1',
      });

      const { router } = renderPlanningCycles();

      await waitFor(() => {
        const failed = router.state.matches.find(
          (match) => match.status === 'error',
        );
        expect(failed?.error).toHaveProperty(
          'message',
          'The Active Church status did not resolve with a Church Timezone',
        );
      });
      expect(screen.queryByTestId('church-time')).not.toBeInTheDocument();
      expect(listPlanningCycles).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  it('mounts the shell when the entry gate resolves an Active Church', async () => {
    getSession.mockResolvedValue({
      data: {
        user: { id: 'u1' },
        session: { activeOrganizationId: 'church-1' },
      },
    });
    getActiveChurchStatus.mockResolvedValue({
      status: 'resolved',
      churchId: 'church-1',
      timezone: 'UTC',
    });
    listPlanningCycles.mockResolvedValue({ cycles: [] });

    renderPlanningCycles();

    expect(await screen.findByText('Existing cycles')).toBeVisible();
  });

  it('sends the visitor to /no-access when no Church Membership resolves', async () => {
    getSession.mockResolvedValue({
      data: {
        user: { id: 'u1' },
        session: { activeOrganizationId: 'church-1' },
      },
    });
    getActiveChurchStatus.mockResolvedValue({ status: 'no_membership' });

    const { router } = renderPlanningCycles();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/no-access');
    });
    expect(listPlanningCycles).not.toHaveBeenCalled();
  });

  it('sends the visitor to /select-church when several Memberships exist and none is active', async () => {
    getSession.mockResolvedValue({
      data: { user: { id: 'u1' }, session: { activeOrganizationId: null } },
    });
    getActiveChurchStatus.mockResolvedValue({ status: 'selection_required' });

    const { router } = renderPlanningCycles();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/select-church');
    });
    expect(listPlanningCycles).not.toHaveBeenCalled();
  });

  it('forwards the former Church name to /select-church when the active Membership was removed and several remain', async () => {
    getSession.mockResolvedValue({
      data: {
        user: { id: 'u1' },
        session: { activeOrganizationId: 'church-1' },
      },
    });
    getActiveChurchStatus.mockResolvedValue({
      status: 'selection_required',
      membershipRemovedFrom: 'Old Church',
    });

    const { router } = renderPlanningCycles();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/select-church');
    });
    expect(router.state.location.search).toEqual({ removedFrom: 'Old Church' });
  });

  it('forwards the former Church name to /no-access when the active Membership was removed and none remain', async () => {
    getSession.mockResolvedValue({
      data: {
        user: { id: 'u1' },
        session: { activeOrganizationId: 'church-1' },
      },
    });
    getActiveChurchStatus.mockResolvedValue({
      status: 'no_membership',
      membershipRemovedFrom: 'Old Church',
    });

    const { router } = renderPlanningCycles();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/no-access');
    });
    expect(router.state.location.search).toEqual({ removedFrom: 'Old Church' });
  });

  it('redirects to /dashboard with the former Church name when the active Membership was removed but one remaining Church auto-selects silently', async () => {
    getSession.mockResolvedValue({
      data: {
        user: { id: 'u1' },
        session: { activeOrganizationId: 'church-1' },
      },
    });
    getActiveChurchStatus
      .mockResolvedValueOnce({
        status: 'resolved',
        churchId: 'church-2',
        membershipRemovedFrom: 'Old Church',
        timezone: 'UTC',
      })
      // The redirect to /dashboard re-enters this same layout's beforeLoad —
      // by then the session's active organization is the newly auto-selected
      // Church, so the real endpoint would no longer report a removal.
      .mockResolvedValue({
        status: 'resolved',
        churchId: 'church-2',
        timezone: 'UTC',
      });

    const { router } = renderPlanningCycles();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
    expect(router.state.location.search).toEqual({ removedFrom: 'Old Church' });
    expect(listPlanningCycles).not.toHaveBeenCalled();
  });

  it('mounts the shell when the session has no active organization yet but auto-selects silently', async () => {
    getSession.mockResolvedValue({
      data: { user: { id: 'u1' }, session: { activeOrganizationId: null } },
    });
    getActiveChurchStatus.mockResolvedValue({
      status: 'resolved',
      churchId: 'church-1',
      timezone: 'UTC',
    });
    listPlanningCycles.mockResolvedValue({ cycles: [] });

    renderPlanningCycles();

    expect(await screen.findByText('Existing cycles')).toBeVisible();
  });

  describe('cross-Church deep links', () => {
    function renderWithChurchParam(church: string) {
      return renderRoute({
        initialPath: `/scheduling/planning-cycles?church=${church}`,
      });
    }

    it('opens directly with no confirmation when the link targets the current Active Church', async () => {
      getSession.mockResolvedValue({
        data: {
          user: { id: 'u1' },
          session: { activeOrganizationId: 'church-1' },
        },
      });
      getActiveChurchStatus.mockResolvedValue({
        status: 'resolved',
        churchId: 'church-1',
        timezone: 'UTC',
      });
      listPlanningCycles.mockResolvedValue({ cycles: [] });

      const { router } = renderWithChurchParam('church-1');

      expect(await screen.findByText('Existing cycles')).toBeVisible();
      expect(router.state.location.pathname).toBe(
        '/scheduling/planning-cycles',
      );
      expect(selectActiveChurch).not.toHaveBeenCalled();
    });

    it('shows one confirmation before switching when the link targets another Church the caller is a member of', async () => {
      getSession.mockResolvedValue({
        data: {
          user: { id: 'u1' },
          session: { activeOrganizationId: 'church-1' },
        },
      });
      getActiveChurchStatus.mockResolvedValue({
        status: 'resolved',
        churchId: 'church-1',
        timezone: 'UTC',
      });
      listActiveChurchOptions.mockResolvedValue({
        churches: [
          { churchId: 'church-1', name: 'Igreja Central' },
          { churchId: 'church-2', name: 'Comunidade Esperança' },
        ],
      });

      const { router } = renderWithChurchParam('church-2');

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/switch-church-confirm');
      });
      expect(router.state.location.search).toEqual({
        target: 'church-2',
        redirect: '/scheduling/planning-cycles',
      });
      expect(listPlanningCycles).not.toHaveBeenCalled();
    });

    it('auto-selects the target Church when no Active Church exists yet and the link is verified', async () => {
      getSession.mockResolvedValue({
        data: { user: { id: 'u1' }, session: { activeOrganizationId: null } },
      });
      getActiveChurchStatus.mockResolvedValue({
        status: 'selection_required',
      });
      listActiveChurchOptions.mockResolvedValue({
        churches: [
          { churchId: 'church-1', name: 'Igreja Central' },
          { churchId: 'church-2', name: 'Comunidade Esperança' },
        ],
      });
      selectActiveChurch.mockResolvedValue({
        status: 'resolved',
        churchId: 'church-2',
        timezone: 'UTC',
      });
      listPlanningCycles.mockResolvedValue({ cycles: [] });

      const { router } = renderWithChurchParam('church-2');

      await waitFor(() => {
        expect(selectActiveChurch).toHaveBeenCalledWith({
          churchId: 'church-2',
        });
      });
      expect(await screen.findByText('Existing cycles')).toBeVisible();
      expect(router.state.location.pathname).toBe(
        '/scheduling/planning-cycles',
      );
    });

    it('falls back to the unresolved-status redirect when the auto-select does not resolve the target Church', async () => {
      getSession.mockResolvedValue({
        data: { user: { id: 'u1' }, session: { activeOrganizationId: null } },
      });
      getActiveChurchStatus.mockResolvedValue({
        status: 'selection_required',
      });
      listActiveChurchOptions.mockResolvedValue({
        churches: [
          { churchId: 'church-1', name: 'Igreja Central' },
          { churchId: 'church-2', name: 'Comunidade Esperança' },
        ],
      });
      selectActiveChurch.mockResolvedValue({ status: 'selection_required' });

      const { router } = renderWithChurchParam('church-2');

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/select-church');
      });
      expect(selectActiveChurch).toHaveBeenCalledWith({ churchId: 'church-2' });
      expect(listPlanningCycles).not.toHaveBeenCalled();
    });

    it('keeps the current Active Church and shows a generic access-denied when the caller has no Membership in the target Church', async () => {
      getSession.mockResolvedValue({
        data: {
          user: { id: 'u1' },
          session: { activeOrganizationId: 'church-1' },
        },
      });
      getActiveChurchStatus.mockResolvedValue({
        status: 'resolved',
        churchId: 'church-1',
        timezone: 'UTC',
      });
      listActiveChurchOptions.mockResolvedValue({
        churches: [{ churchId: 'church-1', name: 'Igreja Central' }],
      });

      const { router } = renderWithChurchParam('church-9');

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/dashboard');
      });
      expect(router.state.location.search).toEqual({ accessDenied: true });
      expect(selectActiveChurch).not.toHaveBeenCalled();
      expect(listPlanningCycles).not.toHaveBeenCalled();
    });
  });
});
