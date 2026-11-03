import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetPerson200 } from '@/infrastructure/api/churchAPI.schemas';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();
const getPerson = vi.fn();
const listPeople = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  peopleApi: {
    getPerson: (...args: unknown[]) => getPerson(...args),
    listPeople: (...args: unknown[]) => listPeople(...args),
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

// A small stand-in that still renders the real breadcrumb overrides the layout computes.
vi.mock('@/components/app-shell', () => ({
  AppShell: ({
    children,
    breadcrumbOverrides,
  }: ChildrenProps & {
    breadcrumbOverrides?: { segment: string; label: string | null }[];
  }) => (
    <>
      <div data-testid="breadcrumb-overrides">
        {JSON.stringify(breadcrumbOverrides ?? [])}
      </div>
      {children}
    </>
  ),
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));

function detail(overrides: Partial<GetPerson200> = {}): GetPerson200 {
  return {
    id: 'mem-1',
    name: 'Ana Souza',
    email: 'ana@example.com',
    canChangeChurchAccess: true,
    canInviteToMinistry: true,
    churchAccess: { accessLevel: 'member', isLastAdmin: false },
    ministries: [
      {
        membershipId: 'mm-1',
        ministryId: 'm-worship',
        ministryName: 'Worship',
        ministryAccessLevel: 'leader',
        roles: [
          { id: 'r1', name: 'Singer', archived: false },
          { id: 'r2', name: 'Drummer', archived: true },
        ],
      },
    ],
    ...overrides,
  };
}

function refusal(status: number) {
  return new AxiosError('refused', String(status), undefined, undefined, {
    status,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  getCallerCapabilities.mockResolvedValue(
    callerCapabilitiesFixture({ isChurchAdmin: true }),
  );
});

afterEach(() => overwriteGetLocale(() => 'pt-BR'));

const open = (id = 'mem-1') =>
  renderRoute({ initialPath: `/people/${id}`, churchTimezone: 'UTC' });

describe('Member detail', () => {
  it('shows an admin the Ministry cards with levels, Roles, archived Roles and Church access', async () => {
    getPerson.mockResolvedValue(detail());

    open();

    expect(
      await screen.findByRole('heading', { name: 'Ana Souza', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    const card = screen.getByRole('heading', { name: 'Worship' }).closest('li');
    expect(card).toHaveTextContent(m.ministry_invitation_access_leader());
    expect(card).toHaveTextContent('Singer');
    expect(card).toHaveTextContent(`Drummer · ${m.people_role_archived()}`);
    expect(
      screen.getByRole('heading', { name: m.people_church_access() }),
    ).toBeInTheDocument();
    expect(screen.getByText(m.people_church_access_member())).toBeVisible();
    expect(getPerson).toHaveBeenCalledWith('mem-1');
  });

  it('flags the last admin and shows no Ministries state for a Ministry-less member', async () => {
    getPerson.mockResolvedValue(
      detail({
        ministries: [],
        churchAccess: { accessLevel: 'admin', isLastAdmin: true },
      }),
    );

    open();

    expect(
      await screen.findByText(m.people_detail_no_ministries()),
    ).toBeInTheDocument();
    expect(screen.getByText(m.people_church_access_admin())).toBeVisible();
    expect(screen.getByText(m.people_last_admin_note())).toBeVisible();
  });

  it('hides the Church access section for a leader and renders no action buttons', async () => {
    getCallerCapabilities.mockResolvedValue(
      callerCapabilitiesFixture({ ledMinistries: 1 }),
    );
    getPerson.mockResolvedValue(
      detail({ churchAccess: undefined, canChangeChurchAccess: false }),
    );

    open();

    await screen.findByRole('heading', { name: 'Worship' });
    expect(screen.queryByText(m.people_church_access())).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('names the member in the breadcrumb on direct entry', async () => {
    getPerson.mockResolvedValue(detail());

    open();

    await screen.findByRole('heading', { name: 'Ana Souza' });
    expect(await screen.findByText(/"label":"Ana Souza"/)).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb-overrides')).toHaveTextContent(
      '"segment":"mem-1"',
    );
  });

  it.each([
    [404, m.people_detail_not_found()],
    [403, m.shell_no_access()],
  ])('shows a %s as a refusal with no name in the breadcrumb', async (status, text) => {
    getPerson.mockRejectedValue(refusal(status));

    open();

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb-overrides')).toHaveTextContent(
      '"label":null',
    );
    expect(
      screen.getByRole('link', { name: m.people_detail_back() }),
    ).toBeInTheDocument();
  });

  it('gives a Volunteer no-access and no member content', async () => {
    getCallerCapabilities.mockResolvedValue(callerCapabilitiesFixture({}));

    open();

    expect(await screen.findByText(m.shell_no_access())).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ana Souza' })).toBeNull();
  });

  it('offers a retry after an unexpected failure', async () => {
    const user = userEvent.setup();
    getPerson.mockRejectedValue(new Error('boom'));

    open();

    expect(
      await screen.findByText(m.people_detail_load_failed()),
    ).toBeInTheDocument();
    getPerson.mockResolvedValue(detail());
    await user.click(
      screen.getByRole('button', { name: m.invitations_retry() }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Worship' }),
    ).toBeVisible();
  });

  it('opens from a directory row to the member detail', async () => {
    const user = userEvent.setup();
    listPeople.mockResolvedValue({
      items: [
        {
          id: 'mem-9',
          name: 'Bia Lima',
          email: 'bia@example.com',
          isAdmin: false,
          ministries: [],
        },
      ],
      options: { ministries: [] },
    });
    getPerson.mockResolvedValue(detail({ id: 'mem-9', name: 'Bia Lima' }));

    renderRoute({ initialPath: '/people', churchTimezone: 'UTC' });
    const list = await screen.findByRole('list', {
      name: m.people_list_label(),
    });
    await user.click(within(list).getByRole('link', { name: 'Bia Lima' }));

    expect(
      await screen.findByRole('heading', { name: 'Bia Lima', level: 1 }),
    ).toBeInTheDocument();
    expect(getPerson).toHaveBeenCalledWith('mem-9');
  });

  it('renders in English', async () => {
    overwriteGetLocale(() => 'en');
    getPerson.mockResolvedValue(detail({ ministries: [] }));

    open();

    expect(
      await screen.findByText('Not serving in any Ministry you can see.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Church access')).toBeInTheDocument();
  });
});
