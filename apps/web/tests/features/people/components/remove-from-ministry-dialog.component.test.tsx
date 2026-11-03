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
const endMinistryMembership = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  peopleApi: {
    getPerson: (...args: unknown[]) => getPerson(...args),
    listPeople: vi.fn(),
    endMinistryMembership: (...args: unknown[]) =>
      endMinistryMembership(...args),
  },
  adminApi: {
    listMinistries: vi.fn().mockResolvedValue({ ministries: [] }),
    listMinistryRoles: vi.fn().mockResolvedValue({ roles: [] }),
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
    canChangeMinistryAccess: false,
    canEndMembership: true,
    ...overrides,
  };
}

function detail(
  ministries = [card()],
  overrides: Partial<GetPerson200> = {},
): GetPerson200 {
  return {
    id: 'mem-1',
    name: 'Ana Souza',
    email: 'ana@example.com',
    canChangeChurchAccess: false,
    canInviteToMinistry: true,
    ministries,
    ...overrides,
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
  getPerson.mockResolvedValue(detail());
});

afterEach(() => overwriteGetLocale(() => 'pt-BR'));

const names = { name: 'Ana Souza', ministry: 'Worship' };

async function openDialog() {
  const user = userEvent.setup();
  renderRoute({
    initialPath: '/people/mem-1',
    churchTimezone: 'America/Sao_Paulo',
  });
  await user.click(
    await screen.findByRole('button', {
      name: m.people_remove_from_ministry_label(names),
    }),
  );
  const dialog = await screen.findByRole('alertdialog', {
    name: m.people_remove_from_ministry_title(names),
  });
  return { user, dialog };
}

const confirmButton = (dialog: HTMLElement) =>
  within(dialog).getByRole('button', {
    name: m.people_remove_from_ministry_confirm(),
  });

describe('Remove from Ministry', () => {
  it('offers removal only on cards the gatekeeper allows', async () => {
    getPerson.mockResolvedValue(
      detail([
        card(),
        card({
          membershipId: 'mm-2',
          ministryId: 'm-kids',
          ministryName: 'Kids',
          canEndMembership: false,
        }),
      ]),
    );
    renderRoute({
      initialPath: '/people/mem-1',
      churchTimezone: 'America/Sao_Paulo',
    });

    expect(
      await screen.findByRole('button', {
        name: m.people_remove_from_ministry_label(names),
      }),
    ).toHaveTextContent(m.people_remove_from_ministry({ ministry: 'Worship' }));
    expect(
      screen.queryByRole('button', {
        name: m.people_remove_from_ministry_label({
          name: 'Ana Souza',
          ministry: 'Kids',
        }),
      }),
    ).not.toBeInTheDocument();
  });

  it('confirms naming the Person and Ministry, cancels without removing', async () => {
    const { user, dialog } = await openDialog();

    expect(dialog).toHaveTextContent(
      m.people_remove_from_ministry_description(names),
    );
    await user.click(
      within(dialog).getByRole('button', { name: m.people_access_cancel() }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(endMinistryMembership).not.toHaveBeenCalled();
  });

  it('shows pending, removes, closes and lands on the empty Ministries state', async () => {
    let finish: (value: unknown) => void = () => undefined;
    endMinistryMembership.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { user, dialog } = await openDialog();
    getPerson.mockResolvedValue(detail([]));

    await user.click(confirmButton(dialog));
    expect(
      within(dialog).getByRole('button', {
        name: m.people_remove_from_ministry_pending(),
      }),
    ).toBeDisabled();
    finish({ changed: true });

    expect(
      await screen.findByText(m.people_detail_no_ministries()),
    ).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(endMinistryMembership).toHaveBeenCalledWith('mem-1', 'mm-1');
    expect(toastSuccess).toHaveBeenCalledWith(
      m.people_removed_from_ministry_toast(names),
    );
    // The invitation entry stays for rejoining.
    expect(
      screen.getByRole('button', { name: m.people_invite_open() }),
    ).toBeVisible();
  });

  it('shows not-found when the removal took the member out of the leader’s view', async () => {
    endMinistryMembership.mockResolvedValue({ changed: true });
    const { user, dialog } = await openDialog();
    getPerson.mockRejectedValue(refusal(404, { error: 'NOT_FOUND' }));

    await user.click(confirmButton(dialog));

    expect(await screen.findByText(m.people_detail_not_found())).toBeVisible();
  });

  it('lists every blocking Assignment and keeps the confirmation open', async () => {
    endMinistryMembership.mockRejectedValue(
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

    await user.click(confirmButton(dialog));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(
      m.people_remove_blocked_title({ name: 'Ana Souza' }),
    );
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
    expect(screen.getByRole('alertdialog')).toBeVisible();
  });

  it('keeps the confirmation after an unexpected failure so it can be retried', async () => {
    endMinistryMembership
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ changed: true });
    const { user, dialog } = await openDialog();

    await user.click(confirmButton(dialog));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      m.people_remove_from_ministry_failed(),
    );
    await user.click(confirmButton(dialog));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(endMinistryMembership).toHaveBeenCalledTimes(2);
  });

  it('closes and refreshes when the membership had already ended', async () => {
    endMinistryMembership.mockRejectedValue(
      refusal(409, { error: 'MINISTRY_MEMBERSHIP_INACTIVE' }),
    );
    const { user, dialog } = await openDialog();
    getPerson.mockResolvedValue(detail([]));

    await user.click(confirmButton(dialog));

    expect(toastError).toHaveBeenCalledWith(
      m.error_ministry_membership_inactive(),
    );
    expect(
      await screen.findByText(m.people_detail_no_ministries()),
    ).toBeVisible();
  });

  it('drops privileged caches and refetches authority after an admin removes themselves', async () => {
    getPerson.mockResolvedValue(
      detail([card()], {
        canChangeChurchAccess: true,
        churchAccess: {
          accessLevel: 'admin',
          isLastAdmin: false,
          isSelf: true,
        },
      }),
    );
    endMinistryMembership.mockResolvedValue({ changed: true });
    const { user, dialog } = await openDialog();
    const capabilityReads = getCallerCapabilities.mock.calls.length;
    getPerson.mockResolvedValue(
      detail([], {
        canChangeChurchAccess: true,
        churchAccess: {
          accessLevel: 'admin',
          isLastAdmin: false,
          isSelf: true,
        },
      }),
    );

    await user.click(confirmButton(dialog));

    expect(
      await screen.findByText(m.people_detail_no_ministries()),
    ).toBeVisible();
    expect(getCallerCapabilities.mock.calls.length).toBeGreaterThan(
      capabilityReads,
    );
  });

  it('speaks English when the locale is English', async () => {
    overwriteGetLocale(() => 'en');
    const { dialog } = await openDialog();

    expect(dialog).toHaveTextContent('Remove Ana Souza from Worship?');
    expect(dialog).toHaveTextContent(
      'Ana Souza stops serving in Worship, and their open availability checks for it are withdrawn.',
    );
    expect(confirmButton(dialog)).toHaveTextContent('Remove');
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeVisible();
  });
});
