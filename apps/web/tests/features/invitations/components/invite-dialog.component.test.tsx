import { m } from '@church/i18n/messages';
import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetCallerCapabilities200 } from '@/infrastructure/api/churchAPI.schemas';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();
const listInvitations = vi.fn();
const listMinistries = vi.fn();
const listMinistryRoles = vi.fn();
const mintMinistryInvitation = vi.fn();
const mintAdminInvitation = vi.fn();
const toastSuccess = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  invitationsApi: {
    listInvitations: (...args: unknown[]) => listInvitations(...args),
    mintAdminInvitation: (...args: unknown[]) => mintAdminInvitation(...args),
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

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
  },
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

const WORSHIP = { id: 'm-worship', name: 'Worship' };
const KIDS = { id: 'm-kids', name: 'Kids' };
const ROLES: Record<string, { id: string; name: string }[]> = {
  'm-worship': [
    { id: 'r-singer', name: 'Singer' },
    { id: 'r-drums', name: 'Drums' },
  ],
  'm-kids': [],
};

function signInAs(capabilities: GetCallerCapabilities200) {
  getCallerCapabilities.mockResolvedValue(capabilities);
}

function offerMinistries(ministries: { id: string; name: string }[]) {
  listMinistries.mockResolvedValue({
    ministries: ministries.map((ministry) => ({
      ...ministry,
      defaultDirection: 'forward',
    })),
  });
}

function refusal(status: number, data: Record<string, unknown>) {
  return new AxiosError('refused', String(status), undefined, undefined, {
    status,
    data,
  } as AxiosResponse);
}

async function openInvite() {
  const user = userEvent.setup();
  renderRoute({ initialPath: '/invitations', churchTimezone: 'UTC' });
  await user.click(
    await screen.findByRole('button', { name: m.invitations_invite_open() }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: m.invitations_invite_title(),
  });
  return { user, dialog };
}

interface ChooseMinistryInput {
  user: ReturnType<typeof userEvent.setup>;
  dialog: HTMLElement;
  name: string;
}

async function chooseMinistry({ user, dialog, name }: ChooseMinistryInput) {
  await user.click(
    within(dialog).getByRole('combobox', {
      name: m.invitations_invite_ministry_label(),
    }),
  );
  await user.click(await screen.findByRole('option', { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  signInAs(callerCapabilitiesFixture({ isChurchAdmin: true }));
  listInvitations.mockResolvedValue({ items: [] });
  offerMinistries([WORSHIP, KIDS]);
  listMinistryRoles.mockImplementation(async (ministryId: string) => ({
    roles: ROLES[ministryId] ?? [],
  }));
  mintMinistryInvitation.mockResolvedValue({ id: 'new-offer' });
  mintAdminInvitation.mockResolvedValue({
    id: 'admin-offer',
    outcome: 'created',
  });
});

describe('Invite dialog', () => {
  it('lets an admin invite a Volunteer with Select all, then closes, toasts and refreshes the list', async () => {
    const { user, dialog } = await openInvite();

    expect(within(dialog).queryByLabelText(/name/i)).toBeNull();
    await user.type(
      within(dialog).getByLabelText(m.invitations_invite_email_label()),
      'ana@example.com',
    );
    await chooseMinistry({ user, dialog, name: 'Worship' });
    await user.click(
      await within(dialog).findByRole('button', {
        name: m.invitations_invite_select_all(),
      }),
    );
    expect(
      within(dialog).getByRole('checkbox', { name: 'Singer' }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole('checkbox', { name: 'Drums' }),
    ).toBeChecked();
    await user.click(
      within(dialog).getByRole('button', {
        name: m.invitations_invite_submit(),
      }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mintMinistryInvitation).toHaveBeenCalledWith('m-worship', {
      email: 'ana@example.com',
      ministryAccessLevel: 'volunteer',
      roleIds: ['r-singer', 'r-drums'],
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      m.invitations_invite_sent_toast({ email: 'ana@example.com' }),
    );
    await waitFor(() => expect(listInvitations).toHaveBeenCalledTimes(2));
  });

  it('presets the only led Ministry and offers a leader no leader grant', async () => {
    signInAs(callerCapabilitiesFixture({ ledMinistries: 1 }));
    offerMinistries([WORSHIP]);
    const { user, dialog } = await openInvite();

    expect(
      within(dialog).queryByRole('radio', {
        name: m.ministry_invitation_access_leader(),
      }),
    ).toBeNull();
    await user.type(
      within(dialog).getByLabelText(m.invitations_invite_email_label()),
      'bia@example.com',
    );
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'Drums' }),
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: m.invitations_invite_submit(),
      }),
    );

    await waitFor(() =>
      expect(mintMinistryInvitation).toHaveBeenCalledWith('m-worship', {
        email: 'bia@example.com',
        ministryAccessLevel: 'volunteer',
        roleIds: ['r-drums'],
      }),
    );
  });

  it('requires a Role for a Volunteer but lets a leader offer have none, and clears Roles on Ministry change', async () => {
    const { user, dialog } = await openInvite();
    await user.type(
      within(dialog).getByLabelText(m.invitations_invite_email_label()),
      'caio@example.com',
    );
    await chooseMinistry({ user, dialog, name: 'Worship' });
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'Singer' }),
    );
    await chooseMinistry({ user, dialog, name: 'Kids' });

    expect(
      await within(dialog).findByText(m.invitations_invite_no_roles()),
    ).toBeVisible();
    const rolesLink = within(dialog).getByRole('link', {
      name: new RegExp(m.invitations_invite_add_role()),
    });
    expect(rolesLink).toHaveAttribute('href', '/ministries/m-kids/roles');
    expect(rolesLink).toHaveAttribute('target', '_blank');

    await user.click(
      within(dialog).getByRole('button', {
        name: m.invitations_invite_submit(),
      }),
    );
    expect(
      within(dialog).getByText(m.error_validation_invitation_role_required()),
    ).toBeVisible();
    expect(mintMinistryInvitation).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole('radio', {
        name: m.ministry_invitation_access_leader(),
      }),
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: m.invitations_invite_submit(),
      }),
    );
    await waitFor(() =>
      expect(mintMinistryInvitation).toHaveBeenCalledWith('m-kids', {
        email: 'caio@example.com',
        ministryAccessLevel: 'leader',
        roleIds: [],
      }),
    );
  });

  it('explains no active Ministry, with the Create Ministry shortcut for admins only, and refreshes on return', async () => {
    offerMinistries([]);
    const { dialog } = await openInvite();

    expect(
      await within(dialog).findByText(m.invitations_invite_no_ministry()),
    ).toBeVisible();
    const link = within(dialog).getByRole('link', {
      name: new RegExp(m.invitations_invite_create_ministry()),
    });
    expect(link).toHaveAttribute('href', '/ministries');
    expect(link).toHaveAttribute('target', '_blank');

    const callsBefore = listMinistries.mock.calls.length;
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() =>
      expect(listMinistries.mock.calls.length).toBeGreaterThan(callsBefore),
    );
    act(() => focusManager.setFocused(undefined));
  });

  it('keeps every input and explains a duplicate refusal, blocking resubmits while pending', async () => {
    let reject: (error: unknown) => void = () => {};
    mintMinistryInvitation.mockReturnValue(
      new Promise((_resolve, rejectPromise) => {
        reject = rejectPromise;
      }),
    );
    const { user, dialog } = await openInvite();
    const email = within(dialog).getByLabelText(
      m.invitations_invite_email_label(),
    );
    await user.type(email, 'ana@example.com');
    await chooseMinistry({ user, dialog, name: 'Worship' });
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'Singer' }),
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: m.invitations_invite_submit(),
      }),
    );

    const pending = within(dialog).getByRole('button', {
      name: m.invitations_invite_submitting(),
    });
    expect(pending).toBeDisabled();
    await act(async () => {
      reject(
        refusal(409, {
          error: 'PENDING_MINISTRY_INVITATION_EXISTS',
          message: 'server text',
          existingInvitation: {
            id: 'old',
            createdAt: '2026-10-30T15:00:00.000Z',
          },
        }),
      );
    });

    expect(
      await within(dialog).findByText(
        m.invitations_invite_already_invited({ date: '30/10/2026 15:00' }),
      ),
    ).toBeVisible();
    expect(email).toHaveValue('ana@example.com');
    expect(
      within(dialog).getByRole('checkbox', { name: 'Singer' }),
    ).toBeChecked();
    expect(mintMinistryInvitation).toHaveBeenCalledTimes(1);
  });

  it('keeps a typed email when the no-props dialog is closed and reopened', async () => {
    const { user, dialog } = await openInvite();
    await user.type(
      within(dialog).getByLabelText(m.invitations_invite_email_label()),
      'ana@example.com',
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(
      screen.getByRole('button', { name: m.invitations_invite_open() }),
    );

    const reopened = await screen.findByRole('dialog', {
      name: m.invitations_invite_title(),
    });
    expect(
      within(reopened).getByLabelText(m.invitations_invite_email_label()),
    ).toHaveValue('ana@example.com');
  });

  it('translates an already-member refusal', async () => {
    mintMinistryInvitation.mockRejectedValue(
      refusal(409, { error: 'INVITEE_ALREADY_MINISTRY_MEMBER', message: 'x' }),
    );
    const { user, dialog } = await openInvite();
    await user.type(
      within(dialog).getByLabelText(m.invitations_invite_email_label()),
      'member@example.com',
    );
    await chooseMinistry({ user, dialog, name: 'Worship' });
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

  it('invites an Admin by email alone, dropping Ministry and Roles chosen before switching', async () => {
    const { user, dialog } = await openInvite();
    await user.type(
      within(dialog).getByLabelText(m.invitations_invite_email_label()),
      'ana@example.com',
    );
    await chooseMinistry({ user, dialog, name: 'Worship' });
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'Singer' }),
    );

    await user.click(
      within(dialog).getByRole('radio', {
        name: m.invitations_invite_as_admin(),
      }),
    );

    expect(
      screen.getByRole('dialog', { name: m.invitations_invite_admin_title() }),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole('combobox', {
        name: m.invitations_invite_ministry_label(),
      }),
    ).toBeNull();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    await user.click(
      within(dialog).getByRole('button', {
        name: m.invitations_invite_submit(),
      }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mintAdminInvitation).toHaveBeenCalledWith({
      email: 'ana@example.com',
    });
    expect(mintMinistryInvitation).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith(
      m.invitations_invite_sent_toast({ email: 'ana@example.com' }),
    );
    await waitFor(() => expect(listInvitations).toHaveBeenCalledTimes(2));
  });

  it('says when an Admin invite upgraded an existing invitation', async () => {
    mintAdminInvitation.mockResolvedValue({ outcome: 'upgraded' });
    const { user, dialog } = await openInvite();
    await user.type(
      within(dialog).getByLabelText(m.invitations_invite_email_label()),
      'pair@example.com',
    );
    await user.click(
      within(dialog).getByRole('radio', {
        name: m.invitations_invite_as_admin(),
      }),
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: m.invitations_invite_submit(),
      }),
    );

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        m.invitations_invite_upgraded_toast({ email: 'pair@example.com' }),
      ),
    );
  });

  it.each([
    ['INVITEE_ALREADY_CHURCH_MEMBER', m.error_invitee_already_church_member],
    [
      'PENDING_CHURCH_INVITATION_EXISTS',
      m.error_pending_church_invitation_exists,
    ],
  ])('keeps the Admin form and explains %s', async (code, message) => {
    mintAdminInvitation.mockRejectedValue(
      refusal(409, { error: code, message: 'server text' }),
    );
    const { user, dialog } = await openInvite();
    const email = within(dialog).getByLabelText(
      m.invitations_invite_email_label(),
    );
    await user.type(email, 'member@example.com');
    await user.click(
      within(dialog).getByRole('radio', {
        name: m.invitations_invite_as_admin(),
      }),
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: m.invitations_invite_submit(),
      }),
    );

    expect(await within(dialog).findByText(message())).toBeVisible();
    expect(email).toHaveValue('member@example.com');
    expect(
      within(dialog).getByRole('radio', {
        name: m.invitations_invite_as_admin(),
      }),
    ).toBeChecked();
  });

  it('offers a Ministry leader no Admin option', async () => {
    signInAs(callerCapabilitiesFixture({ ledMinistries: 1 }));
    offerMinistries([WORSHIP]);
    const { dialog } = await openInvite();

    expect(
      within(dialog).queryByRole('radio', {
        name: m.invitations_invite_as_admin(),
      }),
    ).toBeNull();
  });
});
