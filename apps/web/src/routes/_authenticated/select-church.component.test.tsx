import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/__tests__/setup/render-route';

const getSession = vi.fn();
const getActiveChurchStatus = vi.fn();
const listActiveChurchOptions = vi.fn();
const selectActiveChurch = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    signOut: vi.fn(),
  },
}));

vi.mock('@/utils/api-instances', () => ({
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

function renderSelectChurch(initialPath = '/select-church') {
  return renderRoute({ initialPath });
}

describe('select-church route (compare-access selector)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { user: { id: 'u1', name: 'Dual Member' }, session: {} },
    });
  });

  it('lists every Church Membership with identity, access, areas and last-opened', async () => {
    listActiveChurchOptions.mockResolvedValue({
      churches: [
        {
          churchId: 'church-a',
          name: 'Igreja Central',
          timezone: 'America/Sao_Paulo',
          accessLevel: 'admin',
          availableAreas: ['dashboard', 'scheduling'],
          lastOpenedAt: null,
        },
        {
          churchId: 'church-b',
          name: 'Comunidade Esperança',
          timezone: 'UTC',
          accessLevel: 'member',
          availableAreas: ['dashboard'],
          lastOpenedAt: null,
        },
      ],
    });

    renderSelectChurch();

    expect(await screen.findAllByText('Igreja Central')).not.toHaveLength(0);
    expect(await screen.findAllByText('Comunidade Esperança')).not.toHaveLength(
      0,
    );
    expect(await screen.findAllByText('Church Admin')).not.toHaveLength(0);
    expect(await screen.findAllByText('Church Member')).not.toHaveLength(0);
  });

  it('selects a Church and navigates to the dashboard on success', async () => {
    const user = userEvent.setup();
    listActiveChurchOptions.mockResolvedValue({
      churches: [
        {
          churchId: 'church-a',
          name: 'Igreja Central',
          timezone: 'America/Sao_Paulo',
          accessLevel: 'admin',
          availableAreas: ['dashboard', 'scheduling'],
          lastOpenedAt: null,
        },
      ],
    });
    selectActiveChurch.mockResolvedValue({
      status: 'resolved',
      churchId: 'church-a',
    });
    getActiveChurchStatus.mockResolvedValue({
      status: 'resolved',
      churchId: 'church-a',
    });

    const { router } = renderSelectChurch();
    const options = await screen.findAllByText('Igreja Central');
    await user.click(options[0]);

    await waitFor(() => {
      expect(selectActiveChurch).toHaveBeenCalledWith({
        churchId: 'church-a',
      });
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
  });

  it('shows a removal notice naming the former Church when redirected here with removedFrom', async () => {
    listActiveChurchOptions.mockResolvedValue({
      churches: [
        {
          churchId: 'church-b',
          name: 'Comunidade Esperança',
          timezone: 'UTC',
          accessLevel: 'member',
          availableAreas: ['dashboard'],
          lastOpenedAt: null,
        },
      ],
    });

    renderSelectChurch('/select-church?removedFrom=Igreja+Central');

    expect(await screen.findByText(/no longer have access to/i)).toBeVisible();
    expect(screen.getByText('Igreja Central')).toBeVisible();
  });

  it('shows no removal notice on a plain, unprompted visit', async () => {
    listActiveChurchOptions.mockResolvedValue({ churches: [] });

    renderSelectChurch();

    await screen.findByText('Select an Active Church');
    expect(screen.queryByText(/no longer have access to/i)).toBeNull();
  });
});
