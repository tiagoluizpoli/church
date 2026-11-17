import { m } from '@church/i18n/messages';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetCallerCapabilities200 } from '@/infrastructure/api/churchAPI.schemas';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();
const listMinistries = vi.fn();
const listMinistryDirectory = vi.fn();
const getMinistry = vi.fn();
const listSectors = vi.fn(async () => ({ sectors: [] }));
const listMinistryRoles = vi.fn(async () => ({ roles: [] }));
const createMinistry = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    listMinistries: (...args: unknown[]) => listMinistries(...args),
    listMinistryDirectory: (...args: unknown[]) =>
      listMinistryDirectory(...args),
    getMinistry: (...args: unknown[]) => getMinistry(...args),
    listSectors: () => listSectors(),
    listMinistryRoles: () => listMinistryRoles(),
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

interface MinistryFixtureOverrides {
  sectorCount?: number;
  roleCount?: number;
  needsReview?: boolean;
}

function ministry(
  id: string,
  name: string,
  overrides: MinistryFixtureOverrides = {},
) {
  return {
    sectorCount: 3,
    roleCount: 5,
    needsReview: false,
    ...overrides,
    id,
    churchId: 'church-1',
    name,
    defaultDirection: 'all_out',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
}

type MinistryFixture = ReturnType<typeof ministry>;

interface PageInput {
  ministries: MinistryFixture[];
  nextCursor?: string;
}

/** One server page; counts are whole-scope, so they come from the fixture, not the rows. */
function page({ ministries, nextCursor }: PageInput) {
  return {
    ministries,
    nextCursor,
    counts: { total: 3, review: 2, noSectors: 2 },
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
  const ministries = [
    ministry('m-kids', 'kids'),
    ministry('m-worship', 'Worship'),
  ];
  listMinistries.mockResolvedValue({ ministries });
  listMinistryDirectory.mockResolvedValue(page({ ministries }));
});

function renderList(initialPath = '/ministries') {
  return renderRoute({ initialPath, churchTimezone: 'UTC' });
}

async function rowNames() {
  const list = await screen.findByRole('list', { name: m.nav_ministries() });
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.querySelector('p')?.textContent);
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

  it('shows the counts, the zero-Sector hint and a Revisar action on a needs-review Ministry', async () => {
    signInAs(callerCapabilitiesFixture({ isChurchAdmin: true }));
    listMinistryDirectory.mockResolvedValue(
      page({
        ministries: [
          ministry('m-kids', 'kids', {
            sectorCount: 1,
            roleCount: 1,
            needsReview: true,
          }),
          ministry('m-empty', 'Empty', { sectorCount: 0, roleCount: 0 }),
          ministry('m-worship', 'Worship'),
        ],
      }),
    );

    renderList();

    const items = within(
      await screen.findByRole('list', { name: m.nav_ministries() }),
    ).getAllByRole('listitem');
    const [kids, empty, worship] = items;
    expect(kids).toHaveTextContent('1 setor · 1 função');
    expect(
      within(kids as HTMLElement).getByRole('link', {
        name: m.ministries_review_label({ name: 'kids' }),
      }),
    ).toHaveAttribute('href', '/ministries/m-kids/usual-setup');
    expect(empty).toHaveTextContent(m.ministries_no_sectors());
    expect(empty).not.toHaveTextContent(m.ministries_review());
    expect(worship).toHaveTextContent('3 setores · 5 funções');
    expect(worship).not.toHaveTextContent(m.ministries_review());
  });

  it('sends search and status to the server, keeps them in the URL and shows the server counts', async () => {
    signInAs(callerCapabilitiesFixture({ isChurchAdmin: true }));
    const alpha = ministry('a', 'Alpha', { needsReview: true });
    const beta = ministry('b', 'Beta', { sectorCount: 0, needsReview: true });
    const gamma = ministry('c', 'Gamma', { sectorCount: 0 });
    listMinistryDirectory.mockImplementation(
      async ({ search, status }: { search?: string; status?: string }) =>
        page({
          ministries:
            search === 'missing'
              ? []
              : search === 'ALP'
                ? [alpha]
                : status === 'review'
                  ? [alpha, beta]
                  : [alpha, beta, gamma],
        }),
    );
    const user = userEvent.setup();
    const { router } = renderList();
    expect(await rowNames()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(listMinistryDirectory).toHaveBeenLastCalledWith({});
    expect(screen.getByTestId('ministries-total-chip')).toHaveTextContent('3');
    expect(screen.getByTestId('ministries-review-chip')).toHaveTextContent('2');
    expect(screen.getByTestId('ministries-no-sectors-chip')).toHaveTextContent(
      '2',
    );
    const create = screen.getByRole('button', { name: m.ministries_new() });
    expect(create.parentElement).toHaveClass('justify-end');
    const search = screen.getByRole('searchbox', {
      name: m.ministries_name_label(),
    });

    await user.type(search, 'ALP');
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ search: 'ALP' }),
    );
    expect(await rowNames()).toEqual(['Alpha']);
    expect(listMinistryDirectory).toHaveBeenLastCalledWith({ search: 'ALP' });

    await user.clear(search);
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    await user.click(screen.getByLabelText(m.ministries_filter_status()));
    // base-ui opens a button-triggered Select a frame after mousedown.
    await user.click(
      await screen.findByRole('option', { name: m.ministries_filter_review() }),
    );
    await waitFor(() =>
      expect(listMinistryDirectory).toHaveBeenLastCalledWith({
        status: 'review',
      }),
    );
    expect(await rowNames()).toEqual(['Alpha', 'Beta']);
    expect(router.state.location.search).toEqual({ status: 'review' });

    await user.type(search, 'missing');
    expect(
      await screen.findByText(m.ministries_empty_filtered()),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: m.invitations_clear_filters() }),
    );
    expect(await rowNames()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(router.state.location.search).toEqual({});
    expect(search).toHaveValue('');
  });

  it('asks the server for the trimmed search only once typing pauses for 300 ms', async () => {
    signInAs(callerCapabilitiesFixture({ isChurchAdmin: true }));
    const { router } = renderList();
    await rowNames();
    const before = listMinistryDirectory.mock.calls.length;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      fireEvent.change(
        screen.getByRole('searchbox', { name: m.ministries_name_label() }),
        { target: { value: ' wor ' } },
      );
      await act(() => vi.advanceTimersByTimeAsync(299));
      expect(router.state.location.search).toEqual({});
      expect(listMinistryDirectory).toHaveBeenCalledTimes(before);
      await act(() => vi.advanceTimersByTimeAsync(1));
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ search: 'wor' }),
    );
    await waitFor(() =>
      expect(listMinistryDirectory.mock.calls.slice(before)).toEqual([
        [{ search: 'wor' }],
      ]),
    );
  });

  it('commits the search at once on submit and drops it from the URL when cleared', async () => {
    signInAs(callerCapabilitiesFixture({ isChurchAdmin: true }));
    const { router } = renderList('/ministries?search=kid');
    await rowNames();
    const search = screen.getByRole('searchbox', {
      name: m.ministries_name_label(),
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      fireEvent.change(search, { target: { value: 'wor' } });
      fireEvent.submit(
        screen.getByRole('form', { name: m.ministries_filters_label() }),
      );
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(router.state.location.search).toEqual({ search: 'wor' });
      fireEvent.change(search, { target: { value: '' } });
      await act(() => vi.advanceTimersByTimeAsync(299));
      expect(router.state.location.search).toEqual({ search: 'wor' });
      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(router.state.location.search).toEqual({});
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() =>
      expect(listMinistryDirectory).toHaveBeenLastCalledWith({}),
    );
    expect(listMinistryDirectory).toHaveBeenCalledWith({ search: 'wor' });
  });

  it('reads the filters from the URL on a deep link', async () => {
    signInAs(callerCapabilitiesFixture({ isChurchAdmin: true }));

    renderList('/ministries?status=no-sectors&search=kid');

    expect(await rowNames()).toEqual(['kids', 'Worship']);
    expect(listMinistryDirectory).toHaveBeenCalledWith({
      status: 'no-sectors',
      search: 'kid',
    });
    expect(
      screen.getByRole('searchbox', { name: m.ministries_name_label() }),
    ).toHaveValue('kid');
  });

  it('appends the next server page on Carregar mais', async () => {
    signInAs(callerCapabilitiesFixture({ isChurchAdmin: true }));
    listMinistryDirectory.mockImplementation(
      async ({ cursor }: { cursor?: string }) =>
        cursor === 'next'
          ? page({ ministries: [ministry('c', 'Gamma')] })
          : page({
              ministries: [ministry('a', 'Alpha'), ministry('b', 'Beta')],
              nextCursor: 'next',
            }),
    );
    const user = userEvent.setup();
    renderList();
    expect(await rowNames()).toEqual(['Alpha', 'Beta']);

    await user.click(
      screen.getByRole('button', { name: m.invitations_load_more() }),
    );

    await waitFor(async () =>
      expect(await rowNames()).toEqual(['Alpha', 'Beta', 'Gamma']),
    );
    expect(listMinistryDirectory).toHaveBeenLastCalledWith({ cursor: 'next' });
    expect(
      screen.queryByRole('button', { name: m.invitations_load_more() }),
    ).not.toBeInTheDocument();
  });

  it('keeps the one-row list for a leader of one Ministry, without New Ministry', async () => {
    signInAs(callerCapabilitiesFixture({ ledMinistries: 1 }));
    listMinistryDirectory.mockResolvedValue(
      page({ ministries: [ministry('m-worship', 'Worship')] }),
    );

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
    expect(listMinistryDirectory).not.toHaveBeenCalled();
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
        '/ministries/m-media/operational',
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
