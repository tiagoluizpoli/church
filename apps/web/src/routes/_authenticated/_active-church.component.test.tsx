import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/__tests__/setup/render-route';

const getSession = vi.fn();
const getActiveChurchStatus = vi.fn();
const listPlanningCycles = vi.fn();
const listActiveChurchOptions = vi.fn();

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
});
