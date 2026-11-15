import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ListPeople200,
  ListPeople200ItemsItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();
const listPeople = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  peopleApi: { listPeople: (...args: unknown[]) => listPeople(...args) },
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

vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));

function person(
  overrides: Partial<ListPeople200ItemsItem>,
): ListPeople200ItemsItem {
  return {
    id: 'mem-1',
    name: 'Ana Souza',
    email: 'ana@example.com',
    isAdmin: false,
    ministries: [],
    ...overrides,
  };
}

const OPTIONS = {
  ministries: [
    { id: 'm-kids', name: 'Kids' },
    { id: 'm-worship', name: 'Worship' },
  ],
};

const COUNTS = {
  total: 0,
  admins: 0,
  leaders: 0,
  volunteers: 0,
  withoutMinistry: 0,
};

function page(
  items: ListPeople200ItemsItem[],
  extra: Partial<ListPeople200> = {},
): ListPeople200 {
  return { items, options: OPTIONS, counts: COUNTS, ...extra } as ListPeople200;
}

function renderPeople(initialPath = '/people') {
  return renderRoute({ initialPath, churchTimezone: 'UTC' });
}

async function rows() {
  const list = await screen.findByRole('list', { name: m.people_list_label() });
  return within(list).getAllByRole('listitem');
}

beforeEach(() => {
  vi.clearAllMocks();
  getCallerCapabilities.mockResolvedValue(
    callerCapabilitiesFixture({ isChurchAdmin: true }),
  );
});

afterEach(() => overwriteGetLocale(() => 'pt-BR'));

describe('People directory', () => {
  it('lists members with Ministries, leader and Admin badges, including those in no Ministry', async () => {
    listPeople.mockResolvedValue(
      page([
        person({
          isAdmin: true,
          ministries: [
            { id: 'm-kids', name: 'Kids', ministryAccessLevel: 'leader' },
            {
              id: 'm-worship',
              name: 'Worship',
              ministryAccessLevel: 'volunteer',
            },
          ],
        }),
        person({ id: 'mem-2', name: 'Bia Lima', email: 'bia@example.com' }),
      ]),
    );

    renderPeople();

    const [first, second] = await rows();
    expect(first).toHaveTextContent('Ana Souza');
    expect(
      within(first).getByRole('link', { name: 'Ver Ana Souza' }),
    ).toHaveAttribute('href', '/people/mem-1');
    expect(
      within(first).queryByRole('link', { name: 'Ana Souza' }),
    ).not.toBeInTheDocument();
    expect(first).toHaveTextContent('ana@example.com');
    expect(first).toHaveTextContent(m.join_church_access_admin());
    expect(first).toHaveTextContent(
      `Kids · ${m.ministry_invitation_access_leader()}`,
    );
    expect(first).toHaveTextContent('Worship');
    expect(first).not.toHaveTextContent(
      `Worship · ${m.ministry_invitation_access_volunteer()}`,
    );
    expect(second).toHaveTextContent(m.people_no_ministries());
    expect(second).not.toHaveTextContent(m.join_church_access_admin());
    expect(listPeople).toHaveBeenCalledWith({});
  });

  it('gives a Volunteer no-access without reading people', async () => {
    getCallerCapabilities.mockResolvedValue(callerCapabilitiesFixture({}));

    renderPeople();

    expect(await screen.findByText(m.shell_no_access())).toBeInTheDocument();
    expect(listPeople).not.toHaveBeenCalled();
  });

  it('loads more pages by cursor and restarts at the first page when a filter changes', async () => {
    const user = userEvent.setup();
    listPeople
      .mockResolvedValueOnce(page([person({})], { nextCursor: 'c1' }))
      .mockResolvedValueOnce(page([person({ id: 'mem-2', name: 'Bia Lima' })]))
      .mockResolvedValue(page([person({ id: 'mem-3', name: 'Caio' })]));

    renderPeople();
    await rows();
    await user.click(
      screen.getByRole('button', { name: m.invitations_load_more() }),
    );
    await waitFor(async () => expect(await rows()).toHaveLength(2));
    expect(listPeople).toHaveBeenLastCalledWith({ cursor: 'c1' });

    await user.type(
      screen.getByLabelText(m.people_filter_search()),
      '  caio  ',
    );
    await waitFor(() =>
      expect(listPeople).toHaveBeenLastCalledWith({ search: 'caio' }),
    );
    expect(screen.getByLabelText(m.people_filter_search())).toHaveValue(
      '  caio  ',
    );
    await waitFor(async () => expect(await rows()).toHaveLength(1));
  });

  it('sends the Access filter and offers only the scoped Ministries', async () => {
    const user = userEvent.setup();
    listPeople.mockResolvedValue(page([person({})]));

    renderPeople();
    await rows();
    await user.click(screen.getByLabelText(m.people_filter_access()));
    await user.click(
      await screen.findByRole('option', {
        name: m.ministry_invitation_access_leader(),
      }),
    );

    await waitFor(() =>
      expect(listPeople).toHaveBeenLastCalledWith({ access: 'leader' }),
    );
    await user.click(screen.getByLabelText(m.people_filter_ministry()));
    expect(await screen.findByRole('option', { name: 'Kids' })).toBeVisible();
  });

  it('explains an empty Church and a filter with no matches', async () => {
    const user = userEvent.setup();
    listPeople.mockResolvedValueOnce(page([]));
    renderPeople();
    expect(await screen.findByText(m.people_empty())).toBeInTheDocument();

    listPeople.mockResolvedValue(page([]));
    await user.type(screen.getByLabelText(m.people_filter_search()), 'zzz');
    expect(
      await screen.findByText(m.people_empty_filtered()),
    ).toBeInTheDocument();
    listPeople.mockResolvedValue(page([person({})]));
    await user.click(
      screen.getByRole('button', { name: m.invitations_clear_filters() }),
    );
    expect(await rows()).toHaveLength(1);
    expect(screen.getByLabelText(m.people_filter_search())).toHaveValue('');
  });

  it('searches live without a submit button and keeps the filters in the URL', async () => {
    const user = userEvent.setup();
    listPeople.mockResolvedValue(page([person({})]));

    const { router } = renderPeople();
    await rows();
    expect(
      screen.queryByRole('button', { name: m.invitations_filter_search() }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(m.people_filter_search()), 'ana');
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ search: 'ana' }),
    );
    await user.click(screen.getByLabelText(m.people_filter_access()));
    await user.click(
      await screen.findByRole('option', {
        name: m.ministry_invitation_access_leader(),
      }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        search: 'ana',
        access: 'leader',
      }),
    );
  });

  it('restores the filters from the URL and drops malformed ones', async () => {
    listPeople.mockResolvedValue(page([person({})]));

    renderPeople('/people?search=ana&ministryId=m-kids&access=owner');

    await rows();
    expect(listPeople).toHaveBeenCalledWith({
      search: 'ana',
      ministryId: 'm-kids',
    });
    expect(screen.getByLabelText(m.people_filter_search())).toHaveValue('ana');
    expect(screen.getByLabelText(m.people_filter_ministry())).toHaveTextContent(
      'Kids',
    );
  });

  it('retries a failed next page in place', async () => {
    const user = userEvent.setup();
    listPeople
      .mockResolvedValueOnce(page([person({})], { nextCursor: 'c1' }))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(page([person({ id: 'mem-2', name: 'Bia Lima' })]));

    renderPeople();
    await rows();
    await user.click(
      screen.getByRole('button', { name: m.invitations_load_more() }),
    );
    expect(await screen.findByText(m.people_load_failed())).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: m.invitations_load_more() }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: m.invitations_retry() }),
    );
    await waitFor(async () => expect(await rows()).toHaveLength(2));
    expect(listPeople).toHaveBeenLastCalledWith({ cursor: 'c1' });
    expect(screen.queryByText(m.people_load_failed())).not.toBeInTheDocument();
  });

  it('recovers from a failed load with retry', async () => {
    const user = userEvent.setup();
    listPeople.mockRejectedValueOnce(new Error('boom'));
    listPeople.mockResolvedValue(page([person({})]));

    renderPeople();
    expect(await screen.findByText(m.people_load_failed())).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: m.invitations_retry() }),
    );
    expect(await rows()).toHaveLength(1);
  });

  it('hides cached rows when a refetch is refused', async () => {
    listPeople.mockResolvedValueOnce(page([person({})]));
    const { queryClient } = renderPeople();
    expect(await rows()).toHaveLength(1);

    listPeople.mockRejectedValue(new Error('403'));
    await queryClient.invalidateQueries({ queryKey: ['people'] });

    expect(await screen.findByText(m.people_load_failed())).toBeInTheDocument();
    expect(screen.queryByText('Ana Souza')).not.toBeInTheDocument();
  });

  it('uses pt-BR catalog values by default and English when the locale is English', async () => {
    listPeople.mockResolvedValue(page([person({ isAdmin: true })]));
    const { unmount } = renderPeople();
    const [row] = await rows();
    expect(row).toHaveTextContent('Administrador');
    expect(screen.getByRole('list', { name: 'Pessoas' })).toBeInTheDocument();
    unmount();

    overwriteGetLocale(() => 'en');
    renderPeople();
    const [englishRow] = await rows();
    expect(englishRow).toHaveTextContent('Admin');
    expect(screen.getByLabelText('Name or email')).toBeInTheDocument();
  });
});
