import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const setMinistryRoles = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  peopleApi: {
    getPerson: (...args: unknown[]) => getPerson(...args),
    listPeople: vi.fn(),
    setMinistryRoles: (...args: unknown[]) => setMinistryRoles(...args),
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
    roles: [
      { id: 'r-singer', name: 'Singer', archived: false },
      { id: 'r-keys', name: 'Keys', archived: true },
    ],
    canEditRoles: true,
    canChangeMinistryAccess: false,
    ...overrides,
  };
}

function detail(ministries = [card()]): GetPerson200 {
  return {
    id: 'mem-1',
    name: 'Ana Souza',
    email: 'ana@example.com',
    canChangeChurchAccess: false,
    canInviteToMinistry: false,
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

afterEach(() => overwriteGetLocale(() => 'pt-BR'));

const open = () =>
  renderRoute({
    initialPath: '/people/mem-1',
    churchTimezone: 'America/Sao_Paulo',
  });

const editLabel = () =>
  m.people_edit_roles_label({ name: 'Ana Souza', ministry: 'Worship' });

async function openDialog() {
  const user = userEvent.setup();
  open();
  await user.click(await screen.findByRole('button', { name: editLabel() }));
  const dialog = await screen.findByRole('dialog', {
    name: m.people_edit_roles_title({ name: 'Ana Souza', ministry: 'Worship' }),
  });
  await within(dialog).findByRole('checkbox', { name: 'Guitar' });
  return { user, dialog };
}

const box = (dialog: HTMLElement, name: string) =>
  within(dialog).getByRole('checkbox', { name });

const archivedName = `Keys · ${m.people_role_archived()}`;

describe('Edit Roles', () => {
  it('offers Edit Roles only on cards the gatekeeper allows', async () => {
    getPerson.mockResolvedValue(
      detail([
        card(),
        card({
          membershipId: 'mm-2',
          ministryId: 'm-kids',
          ministryName: 'Kids',
          ministryAccessLevel: 'leader',
          canEditRoles: false,
        }),
      ]),
    );

    open();

    expect(
      await screen.findByRole('button', { name: editLabel() }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: m.people_edit_roles_label({
          name: 'Ana Souza',
          ministry: 'Kids',
        }),
      }),
    ).not.toBeInTheDocument();
  });

  it('lists active Roles plus the held archived Role, checked as held', async () => {
    const { dialog } = await openDialog();

    expect(box(dialog, 'Singer')).toBeChecked();
    expect(box(dialog, 'Guitar')).not.toBeChecked();
    expect(box(dialog, archivedName)).toBeChecked();
    expect(listMinistryRoles).toHaveBeenCalledWith('m-worship');
  });

  it('selects every active Role without restoring an archived Role the editor removed', async () => {
    const { user, dialog } = await openDialog();

    await user.click(box(dialog, archivedName));
    await user.click(
      within(dialog).getByRole('button', {
        name: m.invitations_invite_select_all(),
      }),
    );

    expect(box(dialog, 'Singer')).toBeChecked();
    expect(box(dialog, 'Guitar')).toBeChecked();
    expect(box(dialog, archivedName)).not.toBeChecked();
  });

  it('keeps a held archived Role through Select all', async () => {
    const { user, dialog } = await openDialog();

    await user.click(
      within(dialog).getByRole('button', {
        name: m.invitations_invite_select_all(),
      }),
    );

    expect(box(dialog, archivedName)).toBeChecked();
  });

  it('saves the complete set, shows pending, closes and refreshes the member', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    setMinistryRoles.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { user, dialog } = await openDialog();

    await user.click(box(dialog, 'Guitar'));
    const readsBefore = getPerson.mock.calls.length;
    await user.click(
      within(dialog).getByRole('button', { name: m.people_roles_save() }),
    );

    expect(
      within(dialog).getByRole('button', { name: m.people_access_saving() }),
    ).toBeDisabled();
    expect(setMinistryRoles).toHaveBeenCalledWith('mem-1', 'mm-1', {
      roleIds: ['r-singer', 'r-keys', 'r-guitar'],
    });
    resolve({ changed: true });

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(toastSuccess).toHaveBeenCalledWith(
      m.people_roles_saved_toast({ name: 'Ana Souza' }),
    );
    await waitFor(() =>
      expect(getPerson.mock.calls.length).toBeGreaterThan(readsBefore),
    );
  });

  it('keeps a volunteer-level member on a Role before calling the server', async () => {
    const { user, dialog } = await openDialog();

    await user.click(box(dialog, 'Singer'));
    await user.click(box(dialog, archivedName));
    await user.click(
      within(dialog).getByRole('button', { name: m.people_roles_save() }),
    );

    expect(
      within(dialog).getByText(m.error_ministry_role_required()),
    ).toBeVisible();
    expect(setMinistryRoles).not.toHaveBeenCalled();
  });

  it('lets a leader-level membership hold no Role', async () => {
    getPerson.mockResolvedValue(
      detail([card({ ministryAccessLevel: 'leader', roles: [] })]),
    );
    setMinistryRoles.mockResolvedValue({ changed: false });
    const { user, dialog } = await openDialog();

    await user.click(
      within(dialog).getByRole('button', { name: m.people_roles_save() }),
    );

    expect(setMinistryRoles).toHaveBeenCalledWith('mem-1', 'mm-1', {
      roleIds: [],
    });
  });

  it('lists every blocking Assignment in Church time with a new-tab Assign board link, keeping the edits', async () => {
    setMinistryRoles.mockRejectedValue(
      refusal(409, {
        error: 'UPCOMING_ASSIGNMENTS',
        message: 'server text',
        assignments: [
          {
            assignmentId: 'a-1',
            eventId: 'e-1',
            eventTitle: 'Culto da manhã',
            eventTimeBlockId: 'b-1',
            shiftId: 's-1',
            shiftStart: '2026-11-15T13:00:00.000Z',
            shiftEnd: '2026-11-15T15:00:00.000Z',
            roleId: 'r-singer',
            roleName: 'Singer',
            sectorId: 'sec-1',
            sectorName: 'Palco',
            ministryId: 'm-worship',
            cycleId: 'c-11',
          },
        ],
      }),
    );
    const { user, dialog } = await openDialog();

    await user.click(box(dialog, 'Singer'));
    await user.click(
      within(dialog).getByRole('button', { name: m.people_roles_save() }),
    );

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(m.people_roles_blocked_title());
    // 13:00Z is 10:00 in São Paulo.
    expect(alert).toHaveTextContent(
      m.people_roles_blocker({
        event: 'Culto da manhã',
        time: '15/11/2026 10:00 – 12:00',
        sector: 'Palco',
        role: 'Singer',
      }),
    );
    const link = within(alert).getByRole('link', {
      name: new RegExp(m.people_roles_blocker_link()),
    });
    expect(link).toHaveAttribute('href', '/schedules/m-worship/c-11/assign');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(box(dialog, 'Singer')).not.toBeChecked();
    expect(box(dialog, archivedName)).toBeChecked();
  });

  it('keeps the edits after an unexpected failure so the save can be retried', async () => {
    setMinistryRoles
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ changed: true });
    const { user, dialog } = await openDialog();

    await user.click(box(dialog, 'Guitar'));
    await user.click(
      within(dialog).getByRole('button', { name: m.people_roles_save() }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      m.people_roles_failed(),
    );
    expect(box(dialog, 'Guitar')).toBeChecked();

    await user.click(
      within(dialog).getByRole('button', { name: m.people_roles_save() }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(setMinistryRoles).toHaveBeenCalledTimes(2);
  });

  it('cancels without saving and reopens on the held Roles', async () => {
    const { user, dialog } = await openDialog();

    await user.click(box(dialog, 'Guitar'));
    await user.click(
      within(dialog).getByRole('button', { name: m.people_access_cancel() }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: editLabel() }));
    const reopened = await screen.findByRole('dialog');
    expect(
      await within(reopened).findByRole('checkbox', { name: 'Guitar' }),
    ).not.toBeChecked();
    expect(setMinistryRoles).not.toHaveBeenCalled();
  });

  it('speaks English when the locale is English', async () => {
    overwriteGetLocale(() => 'en');
    const { dialog } = await openDialog();

    expect(dialog).toHaveTextContent(
      m.people_edit_roles_description({ name: 'Ana Souza' }, { locale: 'en' }),
    );
    expect(
      within(dialog).getByRole('checkbox', { name: 'Keys · Archived' }),
    ).toBeChecked();
  });
});
