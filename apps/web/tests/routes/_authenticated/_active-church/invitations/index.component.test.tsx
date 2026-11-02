import { m } from '@church/i18n/messages';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GetCallerCapabilities200,
  ListInvitations200,
  ListInvitations200ItemsItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();
const listInvitations = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  invitationsApi: {
    listInvitations: (...args: unknown[]) => listInvitations(...args),
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
    ...overrides,
  };
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
    listInvitations.mockResolvedValue({
      items: [row({ ministryAccessLevel: 'leader', roles: [] })],
    });

    renderInvitations();

    const [only] = await rows();
    expect(only).toHaveTextContent(m.ministry_invitation_access_leader());
    expect(only).toHaveTextContent(m.ministry_invitation_roles_none());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('refuses a plain member with the no-access state and never asks for the list', async () => {
    signInAs(callerCapabilitiesFixture({ hasVolunteerMembership: true }));

    renderInvitations();

    expect(await screen.findByText(m.shell_no_access())).toBeVisible();
    expect(listInvitations).not.toHaveBeenCalled();
  });

  it('says in Portuguese that nothing is pending', async () => {
    listInvitations.mockResolvedValue({ items: [] });

    renderInvitations();

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Nenhum convite pendente.',
    );
  });

  it('shows a loading state, then recovers from an error with retry', async () => {
    listInvitations.mockRejectedValueOnce(new Error('boom'));
    listInvitations.mockResolvedValueOnce({ items: [row({})] });
    const user = userEvent.setup();

    renderInvitations();

    expect(await screen.findByText(m.invitations_load_failed())).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: m.invitations_retry() }),
    );
    expect(await rows()).toHaveLength(1);
  });

  it('loads the next page with the cursor and appends it without duplicating', async () => {
    listInvitations.mockResolvedValueOnce({
      items: [row({ id: 'mi-1' })],
      nextCursor: 'cursor-2',
    });
    listInvitations.mockResolvedValueOnce({
      items: [row({ id: 'mi-2', email: 'bia@example.com' })],
    });
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
    listInvitations.mockResolvedValueOnce({
      items: [row({})],
      nextCursor: 'cursor-2',
    });
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
