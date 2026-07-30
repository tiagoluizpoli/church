import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/__tests__/setup/render-route';

const getSession = vi.fn();
const getActiveMember = vi.fn();
const listPlanningCycles = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    organization: {
      getActiveMember: (...args: unknown[]) => getActiveMember(...args),
    },
  },
}));

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listPlanningCycles: (...args: unknown[]) => listPlanningCycles(...args),
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
  });

  it('mounts the shell when the active organization is still a live Church Membership', async () => {
    getSession.mockResolvedValue({
      data: {
        user: { id: 'u1' },
        session: { activeOrganizationId: 'church-1' },
      },
    });
    getActiveMember.mockResolvedValue({ data: { id: 'member-1' } });
    listPlanningCycles.mockResolvedValue({ cycles: [] });

    renderPlanningCycles();

    expect(await screen.findByText('Existing cycles')).toBeVisible();
  });

  it('sends the visitor to /no-access when the active organization no longer checks out', async () => {
    getSession.mockResolvedValue({
      data: {
        user: { id: 'u1' },
        session: { activeOrganizationId: 'church-1' },
      },
    });
    getActiveMember.mockResolvedValue({ data: null });

    const { router } = renderPlanningCycles();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/no-access');
    });
    expect(getActiveMember).toHaveBeenCalled();
    expect(listPlanningCycles).not.toHaveBeenCalled();
  });

  it('lets a session with no active organization yet through, without calling getActiveMember', async () => {
    getSession.mockResolvedValue({
      data: { user: { id: 'u1' }, session: { activeOrganizationId: null } },
    });
    listPlanningCycles.mockResolvedValue({ cycles: [] });

    renderPlanningCycles();

    expect(await screen.findByText('Existing cycles')).toBeVisible();
    expect(getActiveMember).not.toHaveBeenCalled();
  });
});
