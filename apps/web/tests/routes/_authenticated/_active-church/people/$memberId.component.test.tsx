import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { screen, waitFor, within } from '@testing-library/react';
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
const listMinistries = vi.fn();
const listMinistryRoles = vi.fn();
const mintMinistryInvitation = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  peopleApi: {
    getPerson: (...args: unknown[]) => getPerson(...args),
    listPeople: (...args: unknown[]) => listPeople(...args),
  },
  adminApi: {
    listMinistries: (...args: unknown[]) => listMinistries(...args),
    listMinistryRoles: (...args: unknown[]) => listMinistryRoles(...args),
    mintMinistryInvitation: (...args: unknown[]) =>
      mintMinistryInvitation(...args),
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
    churchAccess: { accessLevel: 'member', isLastAdmin: false, isSelf: false },
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
        canEditRoles: false,
        canEndMembership: false,
        canChangeMinistryAccess: false,
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
  listMinistries.mockResolvedValue({
    ministries: [
      { id: 'm-worship', name: 'Worship', defaultDirection: 'forward' },
    ],
  });
  listMinistryRoles.mockResolvedValue({
    roles: [{ id: 'r-singer', name: 'Singer' }],
  });
  mintMinistryInvitation.mockResolvedValue({ id: 'offer' });
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
        churchAccess: {
          accessLevel: 'admin',
          isLastAdmin: true,
          isSelf: false,
        },
      }),
    );

    open();

    expect(
      await screen.findByText(m.people_detail_no_ministries()),
    ).toBeInTheDocument();
    expect(screen.getByText(m.people_church_access_admin())).toBeVisible();
    expect(screen.getByText(m.people_last_admin_note())).toBeVisible();
  });

  it('hides the Church access section for a leader and renders only the invite action', async () => {
    getCallerCapabilities.mockResolvedValue(
      callerCapabilitiesFixture({ ledMinistries: 1 }),
    );
    getPerson.mockResolvedValue(
      detail({ churchAccess: undefined, canChangeChurchAccess: false }),
    );

    open();

    await screen.findByRole('heading', { name: 'Worship' });
    expect(screen.queryByText(m.people_church_access())).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: m.people_invite_open() }),
    ).toBeVisible();
  });

  it('opens the shared Ministry-only dialog with the email prefilled on each opening and no Admin option', async () => {
    getPerson.mockResolvedValue(detail());
    const user = userEvent.setup();
    open();

    const trigger = await screen.findByRole('button', {
      name: m.people_invite_open(),
    });
    await user.click(trigger);
    let dialog = await screen.findByRole('dialog');
    const email = within(dialog).getByLabelText(
      m.invitations_invite_email_label(),
    );
    expect(email).toHaveValue('ana@example.com');
    expect(
      within(dialog).queryByRole('radio', {
        name: m.invitations_invite_as_admin(),
      }),
    ).toBeNull();
    expect(
      within(dialog).getByRole('radio', {
        name: m.ministry_invitation_access_leader(),
      }),
    ).toBeVisible();

    await user.clear(email);
    await user.type(email, 'other@example.com');
    await user.click(
      within(dialog).getByRole('button', {
        name: m.invitations_invite_cancel(),
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(trigger);
    dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByLabelText(m.invitations_invite_email_label()),
    ).toHaveValue('ana@example.com');
  });

  it('offers a leader volunteer level only', async () => {
    getCallerCapabilities.mockResolvedValue(
      callerCapabilitiesFixture({ ledMinistries: 1 }),
    );
    getPerson.mockResolvedValue(
      detail({ churchAccess: undefined, canChangeChurchAccess: false }),
    );
    const user = userEvent.setup();
    open();

    await user.click(
      await screen.findByRole('button', { name: m.people_invite_open() }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('radio')).toBeNull();
  });

  it('sends the offer, refreshes People, stays on detail and adds no Ministry card', async () => {
    getPerson.mockResolvedValue(detail({ ministries: [] }));
    const user = userEvent.setup();
    open();

    await user.click(
      await screen.findByRole('button', { name: m.people_invite_open() }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      await within(dialog).findByRole('combobox', {
        name: m.invitations_invite_ministry_label(),
      }),
    );
    await user.click(await screen.findByRole('option', { name: 'Worship' }));
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'Singer' }),
    );
    const reads = getPerson.mock.calls.length;
    await user.click(
      within(dialog).getByRole('button', {
        name: m.invitations_invite_submit(),
      }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mintMinistryInvitation).toHaveBeenCalledWith('m-worship', {
      email: 'ana@example.com',
      ministryAccessLevel: 'volunteer',
      roleIds: ['r-singer'],
    });
    await waitFor(() =>
      expect(getPerson.mock.calls.length).toBeGreaterThan(reads),
    );
    expect(
      screen.getByRole('heading', { name: 'Ana Souza', level: 1 }),
    ).toBeVisible();
    expect(screen.getByText(m.people_detail_no_ministries())).toBeVisible();
  });

  it('translates a refusal and keeps the dialog open for a retry', async () => {
    getPerson.mockResolvedValue(detail());
    mintMinistryInvitation.mockRejectedValue(
      new AxiosError('refused', '409', undefined, undefined, {
        status: 409,
        data: { error: 'INVITEE_ALREADY_MINISTRY_MEMBER' },
      } as never),
    );
    const user = userEvent.setup();
    open();

    await user.click(
      await screen.findByRole('button', { name: m.people_invite_open() }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      await within(dialog).findByRole('combobox', {
        name: m.invitations_invite_ministry_label(),
      }),
    );
    await user.click(await screen.findByRole('option', { name: 'Worship' }));
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'Singer' }),
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: m.invitations_invite_submit(),
      }),
    );

    expect(
      await within(dialog).findByText(
        m.error_invitee_already_ministry_member(),
      ),
    ).toBeVisible();
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
    expect(
      screen.getByRole('button', { name: 'Invite to a Ministry' }),
    ).toBeVisible();
  });
});
