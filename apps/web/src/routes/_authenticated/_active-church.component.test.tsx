import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/__tests__/setup/render-route';

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

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
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
    listActiveChurchOptions.mockResolvedValue({ churches: [] });
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
      })
      // The redirect to /dashboard re-enters this same layout's beforeLoad —
      // by then the session's active organization is the newly auto-selected
      // Church, so the real endpoint would no longer report a removal.
      .mockResolvedValue({ status: 'resolved', churchId: 'church-2' });

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
