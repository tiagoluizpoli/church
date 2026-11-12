import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetCallerCapabilities200 } from '@/infrastructure/api/churchAPI.schemas';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();
const listMinistries = vi.fn();
const getMinistry = vi.fn();
const listSectors = vi.fn(async () => ({ sectors: [] }));
const createMinistry = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    listMinistries: (...args: unknown[]) => listMinistries(...args),
    getMinistry: (...args: unknown[]) => getMinistry(...args),
    listSectors: () => listSectors(),
    createMinistry: (...args: unknown[]) => createMinistry(...args),
  },
  callerCapabilitiesApi: {
    getCallerCapabilities: (...args: unknown[]) =>
      getCallerCapabilities(...args),
  },
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'u1' }, session: {} } }),
  },
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

function ministry(id: string, name: string) {
  return {
    id,
    churchId: 'church-1',
    name,
    defaultDirection: 'all_out',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
}

function signInAs(capabilities: GetCallerCapabilities200) {
  getCallerCapabilities.mockResolvedValue(capabilities);
}

function conflict() {
  return new AxiosError('refused', '409', undefined, undefined, {
    status: 409,
    data: {
      error: 'MINISTRY_NAME_IN_USE',
      message: m.error_ministry_name_in_use(),
    },
  } as AxiosResponse);
}

beforeEach(() => {
  vi.clearAllMocks();
  listMinistries.mockResolvedValue({
    ministries: [ministry('m-kids', 'kids'), ministry('m-worship', 'Worship')],
  });
});

function renderList() {
  return renderRoute({ initialPath: '/ministries', churchTimezone: 'UTC' });
}

async function rowNames() {
  const list = await screen.findByRole('list', { name: m.nav_ministries() });
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent?.replace(m.ministries_open(), ''));
}

describe('/ministries', () => {
  it('lists the active Ministries in server order, each linking to its workspace', async () => {
    signInAs(callerCapabilitiesFixture({ isChurchAdmin: true }));

    renderList();

    expect(await rowNames()).toEqual(['kids', 'Worship']);
    expect(
      within(screen.getByRole('list', { name: m.nav_ministries() })).getByRole(
        'link',
        { name: 'Abrir kids' },
      ),
    ).toHaveAttribute('href', '/ministries/m-kids');
  });

  it('keeps the one-row list for a leader of one Ministry, without New Ministry', async () => {
    signInAs(callerCapabilitiesFixture({ ledMinistries: 1 }));
    listMinistries.mockResolvedValue({
      ministries: [ministry('m-worship', 'Worship')],
    });

    const { router } = renderList();

    expect(await rowNames()).toEqual(['Worship']);
    expect(router.state.location.pathname).toBe('/ministries');
    expect(
      screen.queryByRole('button', { name: m.ministries_new() }),
    ).not.toBeInTheDocument();
  });

  it('refuses a Volunteer with the no-access state', async () => {
    signInAs(callerCapabilitiesFixture({ hasVolunteerMembership: true }));

    renderList();

    expect(await screen.findByText(m.shell_no_access())).toBeVisible();
    expect(listMinistries).not.toHaveBeenCalled();
  });

  it('creates a Ministry from a name-only dialog and opens its Sectors tab with the setup instruction', async () => {
    signInAs(callerCapabilitiesFixture({ isChurchAdmin: true }));
    createMinistry.mockResolvedValue(ministry('m-media', 'Media'));
    getMinistry.mockResolvedValue(ministry('m-media', 'Media'));
    const user = userEvent.setup();
    const { router } = renderList();

    await user.click(
      await screen.findByRole('button', { name: m.ministries_new() }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: m.ministries_create_title(),
    });
    await user.type(
      within(dialog).getByLabelText(m.ministries_name_label()),
      '  Media ',
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: m.ministries_create_submit(),
      }),
    );

    expect(createMinistry).toHaveBeenCalledWith({ name: 'Media' });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/ministries/m-media/sectors',
      ),
    );
    expect(await screen.findByText(m.ministry_sectors_empty())).toBeVisible();
  });

  it('shows a name conflict inline and keeps the typed name', async () => {
    signInAs(callerCapabilitiesFixture({ isChurchAdmin: true }));
    createMinistry.mockRejectedValue(conflict());
    const user = userEvent.setup();
    renderList();

    await user.click(
      await screen.findByRole('button', { name: m.ministries_new() }),
    );
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText(m.ministries_name_label());
    await user.type(input, 'WORSHIP');
    await user.click(
      within(dialog).getByRole('button', {
        name: m.ministries_create_submit(),
      }),
    );

    expect(
      await within(dialog).findByText(m.error_ministry_name_in_use()),
    ).toBeVisible();
    expect(input).toHaveValue('WORSHIP');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('refuses a blank name before sending it', async () => {
    signInAs(callerCapabilitiesFixture({ isChurchAdmin: true }));
    const user = userEvent.setup();
    renderList();

    await user.click(
      await screen.findByRole('button', { name: m.ministries_new() }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(m.ministries_name_label()),
      '   ',
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: m.ministries_create_submit(),
      }),
    );

    expect(
      await within(dialog).findByText(m.ministries_name_required()),
    ).toBeVisible();
    expect(createMinistry).not.toHaveBeenCalled();
  });
});
