import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GetPerson200,
  GetPerson200MinistriesItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();
const getPerson = vi.fn();
const listMinistryRoles = vi.fn();
const changeMinistryAccess = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  peopleApi: {
    getPerson: (...args: unknown[]) => getPerson(...args),
    listPeople: vi.fn(),
    changeMinistryAccess: (...args: unknown[]) => changeMinistryAccess(...args),
  },
  adminApi: {
    listMinistries: vi.fn().mockResolvedValue({ ministries: [] }),
    listMinistryRoles: (...args: unknown[]) => listMinistryRoles(...args),
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

vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

function card(
  overrides: Partial<GetPerson200MinistriesItem> = {},
): GetPerson200MinistriesItem {
  return {
    membershipId: 'mm-1',
    ministryId: 'm-worship',
    ministryName: 'Worship',
    ministryAccessLevel: 'volunteer',
    roles: [{ id: 'r-singer', name: 'Singer', archived: false }],
    canEditRoles: false,
    canChangeMinistryAccess: true,
    ...overrides,
  };
}

function detail(ministries = [card()], isSelf = false): GetPerson200 {
  return {
    id: 'mem-1',
    name: 'Ana Souza',
    email: 'ana@example.com',
    canChangeChurchAccess: false,
    canInviteToMinistry: false,
    churchAccess: { accessLevel: 'member', isLastAdmin: false, isSelf },
    ministries,
  };
}

function refusal(status: number, data: unknown) {
  return new AxiosError('refused', String(status), undefined, undefined, {
    status,
    data,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  getCallerCapabilities.mockResolvedValue(
    callerCapabilitiesFixture({ isChurchAdmin: true }),
  );
  listMinistryRoles.mockResolvedValue({
    roles: [
      { id: 'r-singer', name: 'Singer' },
      { id: 'r-guitar', name: 'Guitar' },
    ],
  });
  getPerson.mockResolvedValue(detail());
});

const names = { name: 'Ana Souza', ministry: 'Worship' };
const open = () =>
  renderRoute({
    initialPath: '/people/mem-1',
    churchTimezone: 'America/Sao_Paulo',
  });

async function openDialog(kind: 'leader' | 'volunteer') {
  const user = userEvent.setup();
  open();
  await user.click(
    await screen.findByRole('button', {
      name:
        kind === 'leader'
          ? m.people_make_leader_label(names)
          : m.people_make_volunteer_label(names),
    }),
  );
  return { user, dialog: await screen.findByRole('dialog') };
}

const demoted = (roles: GetPerson200MinistriesItem['roles']) =>
  detail([card({ ministryAccessLevel: 'leader', roles })]);

describe('Make leader / Make volunteer', () => {
  it('offers the control only where the gatekeeper hint allows, matching the current level', async () => {
    getPerson.mockResolvedValue(
      detail([
        card(),
        card({
          membershipId: 'mm-2',
          ministryId: 'm-kids',
          ministryName: 'Kids',
          ministryAccessLevel: 'leader',
        }),
        card({
          membershipId: 'mm-3',
          ministryId: 'm-av',
          ministryName: 'AV',
          canChangeMinistryAccess: false,
        }),
      ]),
    );
    open();

    expect(
      await screen.findByRole('button', {
        name: m.people_make_leader_label(names),
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: m.people_make_volunteer_label({
          name: 'Ana Souza',
          ministry: 'Kids',
        }),
      }),
    ).toBeVisible();
    expect(screen.queryByText('AV')).toBeVisible();
    expect(screen.getAllByRole('button', { name: /Tornar|Make/ })).toHaveLength(
      2,
    );
  });

  it('confirms naming the Person and Ministry, shows pending, then refreshes reads and capabilities', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    changeMinistryAccess.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { user, dialog } = await openDialog('leader');
    expect(
      within(dialog).getByText(m.people_make_leader_title(names)),
    ).toBeVisible();
    const readsBefore = getPerson.mock.calls.length;
    const capsBefore = getCallerCapabilities.mock.calls.length;

    await user.click(
      within(dialog).getByRole('button', { name: m.people_make_leader() }),
    );

    expect(
      within(dialog).getByRole('button', { name: m.people_access_saving() }),
    ).toBeDisabled();
    expect(changeMinistryAccess).toHaveBeenCalledWith('mem-1', 'mm-1', {
      accessLevel: 'leader',
    });
    resolve({ changed: true });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(toastSuccess).toHaveBeenCalledWith(
      m.people_made_leader_toast(names),
    );
    await waitFor(() => {
      expect(getPerson.mock.calls.length).toBeGreaterThan(readsBefore);
      expect(getCallerCapabilities.mock.calls.length).toBeGreaterThan(
        capsBefore,
      );
    });
  });

  it('makes no call on cancel', async () => {
    const { user, dialog } = await openDialog('leader');
    await user.click(
      within(dialog).getByRole('button', { name: m.people_access_cancel() }),
    );
    expect(changeMinistryAccess).not.toHaveBeenCalled();
  });

  it('demotes without asking for Roles when an active Role is held', async () => {
    getPerson.mockResolvedValue(
      demoted([{ id: 'r-singer', name: 'Singer', archived: false }]),
    );
    changeMinistryAccess.mockResolvedValue({ changed: true });
    const { user, dialog } = await openDialog('volunteer');

    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: m.people_make_volunteer() }),
    );

    expect(changeMinistryAccess).toHaveBeenCalledWith('mem-1', 'mm-1', {
      accessLevel: 'volunteer',
    });
  });

  it('asks for an active Role in the same dialog and sends the complete set', async () => {
    getPerson.mockResolvedValue(
      demoted([{ id: 'r-keys', name: 'Keys', archived: true }]),
    );
    changeMinistryAccess.mockResolvedValue({ changed: true });
    const { user, dialog } = await openDialog('volunteer');
    await within(dialog).findByRole('checkbox', { name: 'Guitar' });

    await user.click(
      within(dialog).getByRole('button', { name: m.people_make_volunteer() }),
    );
    expect(
      within(dialog).getByText(m.error_ministry_role_required()),
    ).toBeVisible();
    expect(changeMinistryAccess).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('checkbox', { name: 'Guitar' }));
    await user.click(
      within(dialog).getByRole('button', { name: m.people_make_volunteer() }),
    );
    expect(changeMinistryAccess).toHaveBeenCalledWith('mem-1', 'mm-1', {
      accessLevel: 'volunteer',
      roleIds: ['r-keys', 'r-guitar'],
    });
  });

  it('keeps the dialog and the blocker list on an Assignment refusal, then retries', async () => {
    getPerson.mockResolvedValue(
      demoted([{ id: 'r-singer', name: 'Singer', archived: false }]),
    );
    changeMinistryAccess.mockRejectedValueOnce(
      refusal(409, {
        error: 'UPCOMING_ASSIGNMENTS',
        message: 'blocked',
        assignments: [
          {
            assignmentId: 'a1',
            eventId: 'e1',
            eventTitle: 'Culto',
            eventTimeBlockId: 'b1',
            shiftId: 's1',
            shiftStart: '2026-11-15T13:00:00.000Z',
            shiftEnd: '2026-11-15T15:00:00.000Z',
            roleId: 'r-singer',
            roleName: 'Singer',
            sectorId: 'sec1',
            sectorName: 'Stage',
            ministryId: 'm-worship',
            cycleId: 'c1',
          },
        ],
      }),
    );
    changeMinistryAccess.mockResolvedValueOnce({ changed: true });
    const { user, dialog } = await openDialog('volunteer');
    const submit = () =>
      user.click(
        within(dialog).getByRole('button', { name: m.people_make_volunteer() }),
      );

    await submit();

    const alert = await within(dialog).findByRole('alert');
    expect(within(alert).getByText(/Culto/)).toBeVisible();
    expect(
      within(alert).getByRole('link', {
        name: new RegExp(m.people_roles_blocker_link()),
      }),
    ).toHaveAttribute('href', '/schedules/m-worship/c1/assign');
    expect(dialog).toBeVisible();

    await submit();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(changeMinistryAccess).toHaveBeenCalledTimes(2);
  });

  it('shows a failure in place and keeps the dialog open for retry', async () => {
    changeMinistryAccess.mockRejectedValue(refusal(500, {}));
    const { user, dialog } = await openDialog('leader');

    await user.click(
      within(dialog).getByRole('button', { name: m.people_make_leader() }),
    );

    expect(
      await within(dialog).findByText(m.people_ministry_access_failed()),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: m.people_make_leader() }),
    ).toBeEnabled();
  });

  it('closes and refreshes when the card turns out stale', async () => {
    changeMinistryAccess.mockRejectedValue(
      refusal(404, { error: 'NOT_FOUND', message: 'x' }),
    );
    const { user, dialog } = await openDialog('leader');
    const readsBefore = getPerson.mock.calls.length;

    await user.click(
      within(dialog).getByRole('button', { name: m.people_make_leader() }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(toastError).toHaveBeenCalledWith(m.people_detail_not_found());
    await waitFor(() =>
      expect(getPerson.mock.calls.length).toBeGreaterThan(readsBefore),
    );
  });

  it('resets capabilities and the member after the caller demotes themself', async () => {
    getPerson.mockResolvedValue(
      detail(
        [
          card({
            ministryAccessLevel: 'leader',
            roles: [{ id: 'r-singer', name: 'Singer', archived: false }],
          }),
        ],
        true,
      ),
    );
    changeMinistryAccess.mockResolvedValue({ changed: true });
    const { user, dialog } = await openDialog('volunteer');
    expect(
      within(dialog).getByText(m.people_make_volunteer_own_title(names)),
    ).toBeVisible();
    const capsBefore = getCallerCapabilities.mock.calls.length;

    await user.click(
      within(dialog).getByRole('button', { name: m.people_make_volunteer() }),
    );

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        m.people_made_own_volunteer_toast(names),
      ),
    );
    await waitFor(() =>
      expect(getCallerCapabilities.mock.calls.length).toBeGreaterThan(
        capsBefore,
      ),
    );
  });
});
