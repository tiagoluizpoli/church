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
