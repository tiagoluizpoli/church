import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/__tests__/setup/render-route';

const getSession = vi.fn();
const listActiveChurchOptions = vi.fn();
const selectActiveChurch = vi.fn();
const getActiveChurchStatus = vi.fn();
const listPlanningCycles = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    signOut: vi.fn(),
  },
}));

vi.mock('@/utils/api-instances', () => ({
  activeChurchApi: {
    listActiveChurchOptions: (...args: unknown[]) =>
      listActiveChurchOptions(...args),
    selectActiveChurch: (...args: unknown[]) => selectActiveChurch(...args),
    getActiveChurchStatus: (...args: unknown[]) =>
      getActiveChurchStatus(...args),
  },
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

const CHURCHES = [
  {
    churchId: 'church-a',
    name: 'Igreja Central',
    timezone: 'America/Sao_Paulo',
    accessLevel: 'admin' as const,
    availableAreas: ['dashboard', 'scheduling'] as const,
    lastOpenedAt: null,
  },
  {
    churchId: 'church-b',
    name: 'Comunidade Esperança',
    timezone: 'UTC',
    accessLevel: 'member' as const,
    availableAreas: ['dashboard', 'scheduling'] as const,
    lastOpenedAt: null,
  },
];

function renderConfirm(initialPath: string) {
  return renderRoute({ initialPath });
}

describe('switch-church-confirm route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: {
        user: { id: 'u1' },
        session: { activeOrganizationId: 'church-a' },
      },
    });
    listActiveChurchOptions.mockResolvedValue({ churches: CHURCHES });
    getActiveChurchStatus.mockResolvedValue({
      status: 'resolved',
      churchId: 'church-a',
    });
    listPlanningCycles.mockResolvedValue({ cycles: [] });
  });

  it('names the current and target Church before switching', async () => {
    renderConfirm(
      '/switch-church-confirm?target=church-b&redirect=%2Fscheduling%2Fplanning-cycles',
    );

    expect(
      await screen.findByText('This link opens another Church'),
    ).toBeVisible();
    expect(screen.getByText('Igreja Central')).toBeVisible();
    expect(screen.getByText('Comunidade Esperança')).toBeVisible();
  });

  it('switches to the target Church and lands on the exact requested destination on confirm', async () => {
    const user = userEvent.setup();
    selectActiveChurch.mockResolvedValue({
      status: 'resolved',
      churchId: 'church-b',
    });
    getActiveChurchStatus.mockResolvedValue({
      status: 'resolved',
      churchId: 'church-b',
    });

    const { router } = renderConfirm(
      '/switch-church-confirm?target=church-b&redirect=%2Fscheduling%2Fplanning-cycles',
    );

    await screen.findByText('This link opens another Church');
    await user.click(
      screen.getByRole('button', { name: /switch to comunidade esperança/i }),
    );

    await waitFor(() => {
      expect(selectActiveChurch).toHaveBeenCalledWith({ churchId: 'church-b' });
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        '/scheduling/planning-cycles',
      );
    });
  });

  it('falls back to the dashboard, not the resource route, when the exact destination carries a Church-owned resource id', async () => {
    // Deliberate: switchActiveChurch reuses the shared preserve-or-fallback
    // route policy from #78 (active-church-switch.ts), same as the manual
    // switcher. A resource-scoped path (e.g. a specific PlanningCycle id)
    // always falls back — the id belonged to the *former* Church's data,
    // so it isn't safe to replay verbatim under the new one.
    const user = userEvent.setup();
    selectActiveChurch.mockResolvedValue({
      status: 'resolved',
      churchId: 'church-b',
    });
    getActiveChurchStatus.mockResolvedValue({
      status: 'resolved',
      churchId: 'church-b',
    });

    const { router } = renderConfirm(
      '/switch-church-confirm?target=church-b&redirect=%2Fscheduling%2Fplanning-cycles%2Fcycle-1',
    );

    await screen.findByText('This link opens another Church');
    await user.click(
      screen.getByRole('button', { name: /switch to comunidade esperança/i }),
    );

    await waitFor(() => {
      expect(selectActiveChurch).toHaveBeenCalledWith({ churchId: 'church-b' });
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
  });

  it('keeps the current Active Church and returns to the dashboard on cancel', async () => {
    const user = userEvent.setup();

    const { router } = renderConfirm(
      '/switch-church-confirm?target=church-b&redirect=%2Fscheduling%2Fplanning-cycles',
    );

    await screen.findByText('This link opens another Church');
    await user.click(
      screen.getByRole('button', { name: /stay in igreja central/i }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
    expect(selectActiveChurch).not.toHaveBeenCalled();
  });

  it('falls back to a generic access-denied dashboard redirect when the target Membership no longer exists', async () => {
    listActiveChurchOptions.mockResolvedValue({
      churches: [CHURCHES[0]],
    });

    const { router } = renderConfirm(
      '/switch-church-confirm?target=church-b&redirect=%2Fscheduling%2Fplanning-cycles',
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
    expect(router.state.location.search).toEqual({ accessDenied: true });
  });

  it('shows an error message when the Church list fails to load', async () => {
    listActiveChurchOptions.mockRejectedValue(new Error('network error'));

    renderConfirm(
      '/switch-church-confirm?target=church-b&redirect=%2Fscheduling%2Fplanning-cycles',
    );

    expect(
      await screen.findByText(
        "Couldn't load your Churches. Try reloading the page.",
      ),
    ).toBeInTheDocument();
    expect(selectActiveChurch).not.toHaveBeenCalled();
  });
});
