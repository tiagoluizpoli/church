import { m } from '@church/i18n/messages';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authClient } from '@/lib/auth-client';
import {
  activeChurchApiMock,
  resolvedActiveChurchStatus,
} from '@/tests/setup/active-church';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getSession = vi.fn();
const { getActiveChurchStatus, listActiveChurchOptions, selectActiveChurch } =
  activeChurchApiMock;

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    signOut: vi.fn(),
  },
}));

vi.mock('@/utils/api-instances', async () => ({
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: ChildrenProps) => children,
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

  it('clears cached caller capabilities when signing out from the selector', async () => {
    listActiveChurchOptions.mockResolvedValue({ churches: [] });
    const { queryClient } = renderSelectChurch();
    const queryKey = ['caller-capabilities', 'u1', 'church-a'];
    queryClient.setQueryData(queryKey, { isChurchAdmin: true });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: m.user_menu_sign_out() }),
    );
    const options = vi.mocked(authClient.signOut).mock.calls[0]?.[0];
    const onSuccess = options?.fetchOptions?.onSuccess;
    if (!onSuccess) throw new Error('Sign out callback missing');
    getSession.mockResolvedValue({ data: null });
    await onSuccess({} as never);
    expect(queryClient.getQueryData(queryKey)).toBeUndefined();
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
    expect(
      await screen.findAllByText(m.select_church_access_admin()),
    ).not.toHaveLength(0);
    expect(
      await screen.findAllByText(m.select_church_access_member()),
    ).not.toHaveLength(0);
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
    selectActiveChurch.mockResolvedValue(
      resolvedActiveChurchStatus({ churchId: 'church-a' }),
    );
    getActiveChurchStatus.mockResolvedValue(
      resolvedActiveChurchStatus({ churchId: 'church-a' }),
    );

    const { router } = renderSelectChurch();
    const options = await screen.findAllByText('Igreja Central');
    await user.click(options[0]);

    await waitFor(() => {
      expect(selectActiveChurch).toHaveBeenCalledWith({
        churchId: 'church-a',
      });
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });

  it('shows an error message when switching the Church fails', async () => {
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
    selectActiveChurch.mockRejectedValue(new Error('network error'));

    const { router } = renderSelectChurch();
    const options = await screen.findAllByText('Igreja Central');
    await user.click(options[0]);

    expect(
      await screen.findByText(m.select_church_switch_error()),
    ).toBeInTheDocument();
    // A first selection that fails leaves selection incomplete: still on the selector.
    expect(router.state.location.pathname).toBe('/select-church');
  });

  it('keeps the current Active Church and stays on the selector when saving a switch fails', async () => {
    const user = userEvent.setup();
    getSession.mockResolvedValue({
      data: {
        user: { id: 'u1', name: 'Dual Member' },
        session: { activeOrganizationId: 'church-a' },
      },
    });
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
    selectActiveChurch.mockRejectedValue(new Error('Internal Server Error'));

    const { router } = renderSelectChurch('/select-church?redirect=%2Fcycles');
    const options = await screen.findAllByText('Comunidade Esperança');
    await user.click(options[0]);

    expect(
      await screen.findByText(m.select_church_switch_error()),
    ).toBeInTheDocument();
    expect(selectActiveChurch).toHaveBeenCalledWith({ churchId: 'church-b' });
    expect(router.state.location.pathname).toBe('/select-church');
    expect(router.state.location.search).toMatchObject({ redirect: '/cycles' });
    expect(getActiveChurchStatus).not.toHaveBeenCalled();
    const routeContext = router.state.matches.at(-1)?.context;
    if (!routeContext || !('session' in routeContext)) {
      throw new Error('Selector route context has no session');
    }
    expect(routeContext.session.data?.session.activeOrganizationId).toBe(
      'church-a',
    );
  });

  it('navigates to the redirect target when the selected target Church has the required capability', async () => {
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
    selectActiveChurch.mockResolvedValue(
      resolvedActiveChurchStatus({ churchId: 'church-a' }),
    );
    getActiveChurchStatus.mockResolvedValue(
      resolvedActiveChurchStatus({ churchId: 'church-a' }),
    );

    const { router } = renderSelectChurch('/select-church?redirect=%2Fcycles');
    const options = await screen.findAllByText('Igreja Central');
    await user.click(options[0]);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cycles');
    });
  });

  it('falls back to the dashboard when the selected target Church lacks the capability required by the redirect target', async () => {
    const user = userEvent.setup();
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
    selectActiveChurch.mockResolvedValue(
      resolvedActiveChurchStatus({ churchId: 'church-b' }),
    );
    getActiveChurchStatus.mockResolvedValue(
      resolvedActiveChurchStatus({ churchId: 'church-b' }),
    );

    const { router } = renderSelectChurch('/select-church?redirect=%2Fcycles');
    const options = await screen.findAllByText('Comunidade Esperança');
    await user.click(options[0]);

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

    expect(
      await screen.findByText(
        m.no_access_removed_from({ churchName: 'Igreja Central' }),
      ),
    ).toBeVisible();
  });

  it('shows no removal notice on a plain, unprompted visit', async () => {
    listActiveChurchOptions.mockResolvedValue({ churches: [] });

    renderSelectChurch();

    await screen.findByText(m.select_church_title());
    expect(
      screen.queryByText(
        m.no_access_removed_from({ churchName: 'Igreja Central' }),
      ),
    ).toBeNull();
  });
});
