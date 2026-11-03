import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GetCallerCapabilities200,
  ListInvitations200,
  ListInvitations200ItemsItem,
  ListInvitations200Options,
} from '@/infrastructure/api/churchAPI.schemas';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();
const listInvitations = vi.fn();
const resendMinistryInvitation = vi.fn();
const revokeMinistryInvitation = vi.fn();
const resendChurchInvitation = vi.fn();
const revokeChurchInvitation = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  invitationsApi: {
    listInvitations: (...args: unknown[]) => listInvitations(...args),
    resendChurchInvitation: (...args: unknown[]) =>
      resendChurchInvitation(...args),
    revokeChurchInvitation: (...args: unknown[]) =>
      revokeChurchInvitation(...args),
  },
  adminApi: {
    resendMinistryInvitation: (...args: unknown[]) =>
      resendMinistryInvitation(...args),
    revokeMinistryInvitation: (...args: unknown[]) =>
      revokeMinistryInvitation(...args),
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
    error: (...args: unknown[]) => toastError(...args),
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

function row(
  overrides: Partial<ListInvitations200ItemsItem>,
): ListInvitations200ItemsItem {
  return {
    kind: 'ministry',
    id: 'mi-1',
    ministryId: 'm-worship',
    ministryName: 'Worship',
    email: 'ana@example.com',
    ministryAccessLevel: 'volunteer',
    roles: [{ id: 'r1', name: 'Singer' }],
    invitedBy: { id: 'u9', name: 'Pastor Paulo' },
    createdAt: '2026-11-01T13:00:00Z',
    expiresAt: '2026-11-20T13:00:00Z',
    status: 'pending',
    displayStatus: 'pending',
    emailDelivery: { state: 'unavailable' },
    lastSentAt: null,
    canResend: false,
    canRevoke: false,
    ...overrides,
  };
}

const ADMIN_OPTIONS: ListInvitations200Options = {
  ministries: [
    { id: 'm-kids', name: 'Kids' },
    { id: 'm-worship', name: 'Worship' },
  ],
  invitedAs: ['admin', 'leader', 'volunteer'],
};
const LEADER_OPTIONS: ListInvitations200Options = {
  ministries: [{ id: 'm-worship', name: 'Worship' }],
  invitedAs: ['leader', 'volunteer'],
};

function page(
  items: ListInvitations200ItemsItem[],
  extra: Partial<ListInvitations200> = {},
): ListInvitations200 {
  return { items, options: ADMIN_OPTIONS, ...extra };
}

function signInAs(capabilities: GetCallerCapabilities200) {
  getCallerCapabilities.mockResolvedValue(capabilities);
}

function renderInvitations() {
  return renderRoute({ initialPath: '/invitations', churchTimezone: 'UTC' });
}

async function rows() {
  const list = await screen.findByRole('list', {
    name: m.invitations_list_label(),
  });
  return within(list).getAllByRole('listitem');
}

beforeEach(() => {
  vi.clearAllMocks();
  signInAs(callerCapabilitiesFixture({ isChurchAdmin: true }));
});

describe('Invitations page', () => {
  it('lists offers with Ministry, Roles, inviter, dates and delivery facts for an admin without a Volunteer profile', async () => {
    listInvitations.mockResolvedValue({
      options: ADMIN_OPTIONS,
      items: [
        row({
          emailDelivery: { state: 'sent', sentAt: '2026-11-01T13:05:00Z' },
          roles: [
            { id: 'r1', name: 'Singer' },
            { id: 'r2', name: 'Drums' },
          ],
        }),
        row({
          kind: 'church',
          id: 'ci-1',
          email: 'chief@example.com',
          ministryId: undefined,
          ministryName: undefined,
          ministryAccessLevel: undefined,
          churchAccessLevel: 'admin',
          roles: [],
          emailDelivery: { state: 'failed' },
        }),
      ],
    } satisfies ListInvitations200);

    renderInvitations();

    const [first, second] = await rows();
    expect(first).toHaveTextContent('ana@example.com');
    expect(first).toHaveTextContent('Worship');
    expect(first).toHaveTextContent(m.ministry_invitation_access_volunteer());
    expect(first).toHaveTextContent('Singer, Drums');
    expect(first).toHaveTextContent(
      m.invitations_invited_by({ name: 'Pastor Paulo' }),
    );
    expect(first).toHaveTextContent(
      m.invitations_email_sent({ date: '01/11/2026 13:05' }),
    );
    expect(second).toHaveTextContent('chief@example.com');
    expect(second).toHaveTextContent(m.join_church_access_admin());
    expect(second).toHaveTextContent(m.invitations_email_failed());
    expect(listInvitations).toHaveBeenCalledWith({});
  });

  it('badges an expired offer, and never calls an unknown delivery sent', async () => {
    listInvitations.mockResolvedValue({
      options: ADMIN_OPTIONS,
      items: [
        row({
          displayStatus: 'expired',
          emailDelivery: { state: 'unavailable' },
        }),
        row({ id: 'mi-2', emailDelivery: { state: 'pending' } }),
      ],
    });

    renderInvitations();

    const [expired, queued] = await rows();
    expect(expired).toHaveTextContent(m.invitations_expired_badge());
    expect(expired).toHaveTextContent(m.invitations_email_unavailable());
    expect(expired).not.toHaveTextContent(
      m.invitations_email_sent({ date: '' }),
    );
    expect(queued).not.toHaveTextContent(m.invitations_expired_badge());
    expect(queued).toHaveTextContent(m.invitations_email_pending());
  });

  it('shows a leader-level row read-only and a zero-Role offer honestly', async () => {
    signInAs(callerCapabilitiesFixture({ ledMinistries: 1 }));
    listInvitations.mockResolvedValue(
      page([row({ ministryAccessLevel: 'leader', roles: [] })], {
        options: LEADER_OPTIONS,
      }),
    );

    renderInvitations();

    const [only] = await rows();
    expect(only).toHaveTextContent(m.ministry_invitation_access_leader());
    expect(only).toHaveTextContent(m.ministry_invitation_roles_none());
    expect(within(only).queryByRole('button')).not.toBeInTheDocument();
  });

  it('refuses a plain member with the no-access state and never asks for the list', async () => {
    signInAs(callerCapabilitiesFixture({ hasVolunteerMembership: true }));

    renderInvitations();

    expect(await screen.findByText(m.shell_no_access())).toBeVisible();
    expect(listInvitations).not.toHaveBeenCalled();
  });

  it('says in Portuguese that nothing is pending', async () => {
    listInvitations.mockResolvedValue(page([]));

    renderInvitations();

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Nenhum convite pendente.',
    );
  });

  it('shows a loading state, then recovers from an error with retry', async () => {
    listInvitations.mockRejectedValueOnce(new Error('boom'));
    listInvitations.mockResolvedValueOnce(page([row({})]));
    const user = userEvent.setup();

    renderInvitations();

    expect(await screen.findByText(m.invitations_load_failed())).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: m.invitations_retry() }),
    );
    expect(await rows()).toHaveLength(1);
  });

  it('loads the next page with the cursor and appends it without duplicating', async () => {
    listInvitations.mockResolvedValueOnce(
      page([row({ id: 'mi-1' })], { nextCursor: 'cursor-2' }),
    );
    listInvitations.mockResolvedValueOnce(
      page([row({ id: 'mi-2', email: 'bia@example.com' })]),
    );
    const user = userEvent.setup();

    renderInvitations();
    await rows();
    await user.click(
      screen.getByRole('button', { name: m.invitations_load_more() }),
    );

    expect(await screen.findByText('bia@example.com')).toBeVisible();
    expect(listInvitations).toHaveBeenLastCalledWith({ cursor: 'cursor-2' });
    expect(await rows()).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: m.invitations_load_more() }),
    ).not.toBeInTheDocument();
  });

  it('keeps the loaded rows and offers retry when a later page fails', async () => {
    listInvitations.mockResolvedValueOnce(
      page([row({})], { nextCursor: 'cursor-2' }),
    );
    listInvitations.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();

    renderInvitations();
    await rows();
    await user.click(
      screen.getByRole('button', { name: m.invitations_load_more() }),
    );

    expect(await screen.findByText(m.invitations_load_failed())).toBeVisible();
    expect(await rows()).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: m.invitations_load_more() }),
    ).toBeEnabled();
  });
});

describe('Invitations filters and history', () => {
  async function pick(label: string, option: string) {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('combobox', { name: label }));
    await user.click(await screen.findByRole('option', { name: option }));
  }

  it('offers admins every picker and sends a combined filter set, restarting at the first page', async () => {
    listInvitations.mockResolvedValueOnce(
      page([row({})], { nextCursor: 'cursor-2' }),
    );
    listInvitations.mockResolvedValue(page([]));
    const user = userEvent.setup();

    renderInvitations();
    await rows();
    await pick(m.invitations_filter_status(), m.invitations_status_accepted());
    await pick(m.invitations_filter_ministry(), 'Worship');
    await pick(m.invitations_filter_invited_as(), m.join_church_access_admin());
    await user.type(
      screen.getByRole('searchbox', { name: m.invitations_filter_email() }),
      'ANA',
    );
    await user.click(
      screen.getByRole('button', { name: m.invitations_filter_search() }),
    );

    await vi.waitFor(() =>
      expect(listInvitations).toHaveBeenLastCalledWith({
        status: 'accepted',
        ministryId: 'm-worship',
        invitedAs: 'admin',
        email: 'ANA',
      }),
    );
    for (const call of listInvitations.mock.calls.slice(1)) {
      expect(call[0]).not.toHaveProperty('cursor');
    }
  });

  it('shows the Ministry picker to a leader of two Ministries only, with just leader and volunteer grants', async () => {
    signInAs(callerCapabilitiesFixture({ ledMinistries: 1 }));
    listInvitations.mockResolvedValue(
      page([row({})], { options: LEADER_OPTIONS }),
    );

    const { unmount } = renderInvitations();
    await rows();
    expect(
      screen.queryByRole('combobox', { name: m.invitations_filter_ministry() }),
    ).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('combobox', { name: m.invitations_filter_invited_as() }),
    );
    expect(
      screen.queryByRole('option', { name: m.join_church_access_admin() }),
    ).not.toBeInTheDocument();
    unmount();

    listInvitations.mockResolvedValue(
      page([row({})], {
        options: { ...LEADER_OPTIONS, ministries: ADMIN_OPTIONS.ministries },
      }),
    );
    renderInvitations();
    expect(
      await screen.findByRole('combobox', {
        name: m.invitations_filter_ministry(),
      }),
    ).toBeVisible();
  });

  it('distinguishes empty history from a filtered-empty result and clears the filters', async () => {
    listInvitations.mockResolvedValue(page([]));
    const user = userEvent.setup();

    renderInvitations();
    await pick(m.invitations_filter_status(), m.invitations_status_declined());
    expect(await screen.findByRole('status')).toHaveTextContent(
      m.invitations_empty_history(),
    );

    await pick(m.invitations_filter_invited_as(), m.join_church_access_admin());
    expect(await screen.findByRole('status')).toHaveTextContent(
      m.invitations_empty_filtered(),
    );
    await user.click(
      screen.getByRole('button', { name: m.invitations_clear_filters() }),
    );
    await vi.waitFor(() =>
      expect(listInvitations).toHaveBeenLastCalledWith({ status: 'declined' }),
    );
  });

  it('shows closure actor, time and reason where recorded and says plainly when they are not', async () => {
    listInvitations.mockResolvedValue(
      page([
        row({
          id: 'a',
          status: 'accepted',
          displayStatus: 'accepted',
          closure: {
            actor: { id: 'u2', name: 'Ana' },
            at: '2026-11-02T10:00:00Z',
          },
        }),
        row({
          id: 'b',
          status: 'rejected',
          displayStatus: 'declined',
          closure: { at: '2026-11-02T11:00:00Z', reason: 'Moved away' },
        }),
        row({ id: 'c', status: 'rejected', displayStatus: 'declined' }),
        row({ id: 'd', status: 'canceled', displayStatus: 'revoked' }),
      ]),
    );

    renderInvitations();

    const [accepted, linkDecline, legacyDecline, revoked] = await rows();
    expect(accepted).toHaveTextContent(
      m.invitations_accepted_by_on({ name: 'Ana', date: '02/11/2026 10:00' }),
    );
    expect(linkDecline).toHaveTextContent(
      m.invitations_declined_link_on({ date: '02/11/2026 11:00' }),
    );
    expect(linkDecline).toHaveTextContent(
      m.invitations_closure_reason({ reason: 'Moved away' }),
    );
    expect(legacyDecline).toHaveTextContent(
      m.invitations_closure_unavailable(),
    );
    expect(revoked).toHaveTextContent(m.invitations_closure_unavailable());
    expect(revoked).toHaveTextContent(m.invitations_status_revoked());
  });
});

function refusal(status: number, error: string) {
  return new AxiosError('refused', String(status), undefined, undefined, {
    status,
    data: { error, message: error },
  } as AxiosResponse);
}

describe('Invitations resend', () => {
  const resendButton = (email: string) =>
    screen.findByRole('button', {
      name: m.invitations_resend_label({ email }),
    });

  it('offers Resend only on rows the server allows, including an expired offer whose email failed', async () => {
    listInvitations.mockResolvedValue(
      page([
        row({
          id: 'mi-failed',
          email: 'failed@example.com',
          displayStatus: 'expired',
          emailDelivery: { state: 'failed' },
          canResend: true,
        }),
        row({ id: 'mi-leader', email: 'leader@example.com', canResend: false }),
        row({
          kind: 'church',
          id: 'ci-admin',
          email: 'admin@example.com',
          ministryId: undefined,
          ministryName: undefined,
          ministryAccessLevel: undefined,
          churchAccessLevel: 'admin',
          canResend: false,
        }),
      ]),
    );

    renderInvitations();

    const [failed, leader, church] = await rows();
    expect(
      within(failed).getByRole('button', {
        name: m.invitations_resend_label({ email: 'failed@example.com' }),
      }),
    ).toHaveTextContent(m.invitations_resend());
    expect(within(leader).queryByRole('button')).not.toBeInTheDocument();
    expect(within(church).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Revogar')).not.toBeInTheDocument();
  });

  it('resends a Church row through the Church client by its id and refetches', async () => {
    const user = userEvent.setup();
    listInvitations.mockResolvedValue(
      page([
        row({
          kind: 'church',
          id: 'ci-1',
          ministryId: undefined,
          email: 'admin@example.com',
          canResend: true,
        }),
      ]),
    );
    resendChurchInvitation.mockResolvedValue({ id: 'ci-1' });

    renderInvitations();
    await user.click(await resendButton('admin@example.com'));

    expect(resendChurchInvitation).toHaveBeenCalledWith('ci-1');
    expect(resendMinistryInvitation).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        m.invitations_resend_queued_toast({ email: 'admin@example.com' }),
      ),
    );
  });

  it('resends through the Ministry client once, reports a queued email and refetches the current filters', async () => {
    const user = userEvent.setup();
    listInvitations.mockResolvedValue(page([row({ canResend: true })]));
    let finish: (value: unknown) => void = () => {};
    resendMinistryInvitation.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    renderInvitations();
    const button = await resendButton('ana@example.com');
    await user.click(button);
    await user.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(m.invitations_resending());
    expect(resendMinistryInvitation).toHaveBeenCalledTimes(1);
    expect(resendMinistryInvitation).toHaveBeenCalledWith('m-worship', 'mi-1');
    const listCalls = listInvitations.mock.calls.length;
    finish({ id: 'mi-1', deliveryStatus: 'pending' });

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        m.invitations_resend_queued_toast({ email: 'ana@example.com' }),
      ),
    );
    await waitFor(() =>
      expect(listInvitations.mock.calls.length).toBeGreaterThan(listCalls),
    );
    expect(listInvitations.mock.calls.at(-1)).toEqual(
      listInvitations.mock.calls[0],
    );
    expect(m.invitations_resend_queued_toast({ email: 'a' })).toContain(
      'na fila',
    );
  });

  it.each([
    [429, 'RESEND_COOLDOWN_ACTIVE', 'Aguarde um minuto antes de reenviar.'],
    [429, 'RESEND_DAILY_CAP_EXCEEDED', 'Limite de reenvios atingido por hoje.'],
    [
      409,
      'INVITATION_NOT_PENDING',
      'Este convite não está mais pendente. Atualize a lista.',
    ],
  ] as const)('explains a %i %s refusal in Portuguese and allows retry', async (status, code, text) => {
    const user = userEvent.setup();
    listInvitations.mockResolvedValue(page([row({ canResend: true })]));
    resendMinistryInvitation.mockRejectedValue(refusal(status, code));

    renderInvitations();
    const button = await resendButton('ana@example.com');
    await user.click(button);

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(text));
    expect(toastSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(button).toBeEnabled());
  });
});

describe('Invitations revoke', () => {
  const revokeButton = (email: string) =>
    screen.findByRole('button', {
      name: m.invitations_revoke_label({ email }),
    });

  it('offers Revoke only on rows the server allows, Church rows included', async () => {
    listInvitations.mockResolvedValue(
      page([
        row({
          id: 'mi-expired',
          email: 'expired@example.com',
          displayStatus: 'expired',
          canRevoke: true,
        }),
        row({ id: 'mi-leader', email: 'leader@example.com' }),
        row({
          kind: 'church',
          id: 'ci-admin',
          email: 'admin@example.com',
          ministryId: undefined,
          ministryName: undefined,
          ministryAccessLevel: undefined,
          churchAccessLevel: 'admin',
          canRevoke: true,
        }),
      ]),
    );

    renderInvitations();

    const [expired, leader, church] = await rows();
    expect(
      within(expired).getByRole('button', {
        name: 'Revogar o convite para expired@example.com',
      }),
    ).toHaveTextContent('Revogar');
    expect(within(leader).queryByRole('button')).not.toBeInTheDocument();
    expect(
      within(church).getByRole('button', {
        name: 'Revogar o convite para admin@example.com',
      }),
    ).toBeInTheDocument();
  });

  it('warns that a Church offer takes its pending Ministry invitations with it and revokes it through the Church client', async () => {
    const user = userEvent.setup();
    listInvitations.mockResolvedValue(
      page([
        row({
          kind: 'church',
          id: 'ci-admin',
          email: 'admin@example.com',
          ministryId: undefined,
          ministryName: undefined,
          ministryAccessLevel: undefined,
          churchAccessLevel: 'admin',
          canRevoke: true,
        }),
      ]),
    );
    revokeChurchInvitation.mockResolvedValue(undefined);

    renderInvitations();
    await user.click(await revokeButton('admin@example.com'));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Revogar o convite para admin@example.com?',
    );
    expect(dialog).toHaveTextContent(
      'Todos os convites de ministério pendentes desta oferta também são revogados.',
    );
    const listCalls = listInvitations.mock.calls.length;
    await user.click(
      within(dialog).getByRole('button', { name: 'Revogar convite' }),
    );

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        'Convite para admin@example.com revogado',
      ),
    );
    expect(revokeChurchInvitation).toHaveBeenCalledWith('ci-admin');
    expect(revokeMinistryInvitation).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(listInvitations.mock.calls.length).toBeGreaterThan(listCalls),
    );
  });

  it('changes nothing when the confirmation is canceled', async () => {
    const user = userEvent.setup();
    listInvitations.mockResolvedValue(page([row({ canRevoke: true })]));

    renderInvitations();
    await user.click(await revokeButton('ana@example.com'));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Revogar o convite para ana@example.com?');
    expect(dialog).toHaveTextContent(m.invitations_revoke_description());
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(revokeMinistryInvitation).not.toHaveBeenCalled();
    expect(await rows()).toHaveLength(1);
  });

  it('revokes once on confirmation, blocks a second submit, reports success and refetches the current filters', async () => {
    const user = userEvent.setup();
    listInvitations.mockResolvedValue(page([row({ canRevoke: true })]));
    let finish: (value: unknown) => void = () => {};
    revokeMinistryInvitation.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    renderInvitations();
    await user.click(await revokeButton('ana@example.com'));
    const confirm = within(await screen.findByRole('alertdialog')).getByRole(
      'button',
      { name: 'Revogar convite' },
    );
    await user.click(confirm);

    await waitFor(() => expect(confirm).toBeDisabled());
    expect(confirm).toHaveTextContent('Revogando…');
    await user.click(confirm);
    expect(revokeMinistryInvitation).toHaveBeenCalledTimes(1);
    expect(revokeMinistryInvitation).toHaveBeenCalledWith('m-worship', 'mi-1');
    const listCalls = listInvitations.mock.calls.length;
    finish(undefined);

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        'Convite para ana@example.com revogado',
      ),
    );
    await waitFor(() =>
      expect(listInvitations.mock.calls.length).toBeGreaterThan(listCalls),
    );
    expect(listInvitations.mock.calls.at(-1)).toEqual(
      listInvitations.mock.calls[0],
    );
  });

  it.each([
    [
      409,
      'INVITATION_NOT_PENDING',
      'Este convite não está mais pendente. Atualize a lista.',
    ],
    [
      403,
      'INSUFFICIENT_INVITATION_AUTHORITY',
      'Não foi possível revogar o convite. Tente novamente.',
    ],
  ] as const)('explains a %i %s refusal in Portuguese and refetches', async (status, code, text) => {
    const user = userEvent.setup();
    listInvitations.mockResolvedValue(page([row({ canRevoke: true })]));
    revokeMinistryInvitation.mockRejectedValue(refusal(status, code));

    renderInvitations();
    await user.click(await revokeButton('ana@example.com'));
    const listCalls = listInvitations.mock.calls.length;
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Revogar convite',
      }),
    );

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(text));
    expect(toastSuccess).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(listInvitations.mock.calls.length).toBeGreaterThan(listCalls),
    );
  });

  it('shows who revoked, when and why in Portuguese, archived Ministries included', async () => {
    listInvitations.mockResolvedValue(
      page([
        row({
          id: 'manual',
          status: 'canceled',
          displayStatus: 'revoked',
          closure: {
            actor: { id: 'u2', name: 'Bia' },
            at: '2026-11-02T10:00:00Z',
            reason: 'manual',
          },
        }),
        row({
          id: 'archived',
          ministryName: 'Coral antigo',
          status: 'canceled',
          displayStatus: 'revoked',
          closure: {
            actor: { id: 'u3', name: 'Caio' },
            at: '2026-11-03T10:00:00Z',
            reason: 'ministry-archived',
          },
        }),
        row({
          kind: 'church',
          id: 'parent',
          email: 'parent@example.com',
          ministryId: undefined,
          ministryName: undefined,
          ministryAccessLevel: undefined,
          churchAccessLevel: 'admin',
          roles: [],
          status: 'canceled',
          displayStatus: 'revoked',
          closure: {
            actor: { id: 'u3', name: 'Caio' },
            at: '2026-11-03T10:00:00Z',
            reason: 'ministry-archived',
          },
        }),
      ]),
    );

    renderInvitations();

    const [manual, archived, parent] = await rows();
    expect(manual).toHaveTextContent(
      'Revogado por Bia em 02/11/2026 10:00 · Revogado manualmente',
    );
    expect(archived).toHaveTextContent('Coral antigo');
    expect(archived).toHaveTextContent(
      'Revogado por Caio em 03/11/2026 10:00 · Revogado: Ministério arquivado',
    );
    expect(archived).not.toHaveTextContent('ministry-archived');
    expect(parent).toHaveTextContent(
      'Revogado por Caio em 03/11/2026 10:00 · Revogado: Ministério arquivado',
    );
  });
});
