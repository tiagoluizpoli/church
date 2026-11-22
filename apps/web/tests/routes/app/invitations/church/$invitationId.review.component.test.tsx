import { m } from '@church/i18n/messages';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/tests/setup/render-route';

interface SignOutOptions {
  fetchOptions: { onSuccess: () => void };
}

const PATH = '/app/invitations/church/invitation-1/review';

const getSession = vi.fn();
const signOut = vi.fn();
const getChurchInvitationReviewStatus = vi.fn();
const acceptChurchInvitation = vi.fn();
const declineChurchInvitation = vi.fn();
const getMinistryInvitationStatus = vi.fn();
const listActiveChurchOptions = vi.fn();
const selectActiveChurch = vi.fn();

vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    signOut: (...args: unknown[]) => signOut(...args),
    useSession: () => ({ isPending: false }),
  },
}));

vi.mock('@/utils/api-instances', () => ({
  redemptionApi: {
    getChurchInvitationReviewStatus: (...args: unknown[]) =>
      getChurchInvitationReviewStatus(...args),
    acceptChurchInvitation: (...args: unknown[]) =>
      acceptChurchInvitation(...args),
    declineChurchInvitation: (...args: unknown[]) =>
      declineChurchInvitation(...args),
    getMinistryInvitationStatus: (...args: unknown[]) =>
      getMinistryInvitationStatus(...args),
  },
  activeChurchApi: {
    listActiveChurchOptions: (...args: unknown[]) =>
      listActiveChurchOptions(...args),
    selectActiveChurch: (...args: unknown[]) => selectActiveChurch(...args),
  },
}));

const REDEEMABLE = {
  kind: 'redeemable' as const,
  churchName: 'St. Peter',
  email: 'bruno@example.test',
  churchAccessLevel: 'member' as const,
  expiresAt: '2099-01-01T00:00:00.000Z',
  reviewToken: 'token-1',
};

const CHURCH_OPTION = {
  churchId: 'church-b',
  name: 'St. Peter',
  timezone: 'UTC',
  accessLevel: 'member' as const,
  availableAreas: ['dashboard' as const],
  lastOpenedAt: null,
};

async function setup() {
  const { default: userEvent } = await import('@testing-library/user-event');
  return { user: userEvent.setup(), ...renderRoute({ initialPath: PATH }) };
}

function clickAccept(user: Awaited<ReturnType<typeof setup>>['user']) {
  return screen
    .findByRole('button', { name: m.ministry_invitation_accept() })
    .then((button) => user.click(button));
}

describe('the signed-in Church Invitation review route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { user: { id: 'u1' }, session: {} },
    });
  });

  it('shows a shared skeleton while loading', async () => {
    getChurchInvitationReviewStatus.mockReturnValue(new Promise(() => {}));
    renderRoute({ initialPath: PATH });

    const busy = await screen.findByLabelText(m.ministry_invitation_loading());
    expect(busy).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the Church, Church Access Level and expiry under the Church breadcrumb', async () => {
    getChurchInvitationReviewStatus.mockResolvedValue({
      ...REDEEMABLE,
      churchAccessLevel: 'admin',
    });
    await setup();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: m.church_invitation_review_title({ churchName: 'St. Peter' }),
      }),
    ).toBeVisible();
    expect(screen.getByText('St. Peter', { selector: 'dd' })).toBeVisible();
    expect(screen.getByText(m.join_church_access_admin())).toBeVisible();
    expect(
      screen.getByText(m.church_invitation_review_expires_label()),
    ).toBeVisible();
    expect(screen.getByText(m.breadcrumb_church_invitation())).toBeVisible();
    expect(getChurchInvitationReviewStatus).toHaveBeenCalledWith(
      'invitation-1',
    );
  });

  it('replaces itself with the Ministry review on paired', async () => {
    getChurchInvitationReviewStatus.mockResolvedValue({
      kind: 'paired',
      ministryInvitationId: 'ministry-9',
    });
    getMinistryInvitationStatus.mockReturnValue(new Promise(() => {}));
    const { router } = await setup();

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/app/invitations/ministry/ministry-9',
      ),
    );
  });

  it('offers to continue for an already-accepted invitation', async () => {
    getChurchInvitationReviewStatus.mockResolvedValue({
      kind: 'already-accepted',
      churchId: 'church-b',
    });
    listActiveChurchOptions.mockResolvedValue({ churches: [CHURCH_OPTION] });
    selectActiveChurch.mockResolvedValue({ churchId: 'church-b' });
    const { user, router } = await setup();

    expect(
      await screen.findByText(m.ministry_invitation_already_accepted_title()),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', {
        name: m.ministry_invitation_continue_home(),
      }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/app'));
    expect(selectActiveChurch).toHaveBeenCalledWith({ churchId: 'church-b' });
  });

  it('shows a wrong login only the masked email, with a Log out that returns here', async () => {
    getChurchInvitationReviewStatus.mockResolvedValue({
      kind: 'identity-mismatch',
      maskedEmail: 'b***@example.test',
    });
    signOut.mockImplementation(({ fetchOptions }: SignOutOptions) => {
      getSession.mockResolvedValue({ data: null });
      fetchOptions.onSuccess();
    });
    const { user, router, container } = await setup();

    expect(
      await screen.findByText(
        m.ministry_invitation_wrong_login_description({
          maskedEmail: 'b***@example.test',
        }),
      ),
    ).toBeVisible();
    expect(container.textContent).not.toContain('bruno@');
    expect(
      screen.queryByRole('button', { name: m.ministry_invitation_accept() }),
    ).toBeNull();

    await user.click(
      screen.getByRole('button', { name: m.ministry_invitation_logout() }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toEqual({ redirect: PATH });
  });

  it('shows the unavailable recovery with a Log in link back to the review', async () => {
    getChurchInvitationReviewStatus.mockResolvedValue({ kind: 'unavailable' });
    await setup();

    expect(
      await screen.findByText(m.ministry_invitation_unavailable_title()),
    ).toBeVisible();
    const hrefs = screen
      .getAllByRole('link', { name: m.ministry_invitation_login() })
      .map((link) => link.getAttribute('href'));
    expect(hrefs).toContainEqual(
      expect.stringContaining(encodeURIComponent(PATH)),
    );
  });

  it('accepts with the review token, then lands home in the invited Church', async () => {
    getChurchInvitationReviewStatus.mockResolvedValue(REDEEMABLE);
    acceptChurchInvitation.mockResolvedValue({
      kind: 'full-success',
      churchId: 'church-b',
    });
    listActiveChurchOptions.mockResolvedValue({ churches: [CHURCH_OPTION] });
    selectActiveChurch.mockResolvedValue({ churchId: 'church-b' });
    const { user, router } = await setup();

    await clickAccept(user);

    expect(acceptChurchInvitation).toHaveBeenCalledWith('invitation-1', {
      idempotencyKey: expect.any(String),
      reviewToken: 'token-1',
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'));
    expect(selectActiveChurch).toHaveBeenCalledWith({ churchId: 'church-b' });
  });

  it('cannot double submit: Accept is busy and disabled while the request runs', async () => {
    getChurchInvitationReviewStatus.mockResolvedValue(REDEEMABLE);
    acceptChurchInvitation.mockReturnValue(new Promise(() => {}));
    const { user } = await setup();

    await clickAccept(user);

    const busy = await screen.findByRole('button', {
      name: m.ministry_invitation_accepting(),
    });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(acceptChurchInvitation).toHaveBeenCalledTimes(1);
  });

  it('on offer-changed, refetches and announces the notice before a new Accept', async () => {
    getChurchInvitationReviewStatus
      .mockResolvedValueOnce(REDEEMABLE)
      .mockResolvedValue({
        ...REDEEMABLE,
        churchAccessLevel: 'admin',
        reviewToken: 'token-2',
      });
    acceptChurchInvitation.mockResolvedValueOnce({ kind: 'offer-changed' });
    const { user } = await setup();

    await clickAccept(user);

    expect(
      await screen.findByText(m.ministry_invitation_offer_changed_title()),
    ).toBeVisible();
    expect(await screen.findByText(m.join_church_access_admin())).toBeVisible();
    expect(getChurchInvitationReviewStatus).toHaveBeenCalledTimes(2);

    acceptChurchInvitation.mockReturnValue(new Promise(() => {}));
    await clickAccept(user);
    expect(acceptChurchInvitation).toHaveBeenLastCalledWith('invitation-1', {
      idempotencyKey: expect.any(String),
      reviewToken: 'token-2',
    });
  });

  it('on an accept-time already-accepted, continues into that Church', async () => {
    getChurchInvitationReviewStatus.mockResolvedValue(REDEEMABLE);
    acceptChurchInvitation.mockResolvedValue({
      kind: 'already-accepted',
      churchId: 'church-b',
    });
    listActiveChurchOptions.mockResolvedValue({ churches: [CHURCH_OPTION] });
    selectActiveChurch.mockResolvedValue({ churchId: 'church-b' });
    const { user, router } = await setup();

    await clickAccept(user);

    await waitFor(() => expect(router.state.location.pathname).toBe('/app'));
    expect(selectActiveChurch).toHaveBeenCalledWith({ churchId: 'church-b' });
  });

  it('on an accept-time identity mismatch, shows the wrong login with the masked email', async () => {
    getChurchInvitationReviewStatus.mockResolvedValue(REDEEMABLE);
    acceptChurchInvitation.mockResolvedValue({
      kind: 'identity-mismatch',
      maskedEmail: 'b***@example.test',
    });
    const { user } = await setup();

    await clickAccept(user);

    expect(
      await screen.findByText(
        m.ministry_invitation_wrong_login_description({
          maskedEmail: 'b***@example.test',
        }),
      ),
    ).toBeVisible();
  });

  it('on a retryable failure, shows an inline error and keeps Accept enabled', async () => {
    getChurchInvitationReviewStatus.mockResolvedValue(REDEEMABLE);
    acceptChurchInvitation.mockResolvedValue({
      kind: 'retryable-failure',
      reason: 'IDENTITY_FAILED',
    });
    const { user } = await setup();

    await clickAccept(user);

    expect(
      await screen.findByText(
        m.church_invitation_review_accept_retry_description(),
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: m.ministry_invitation_accept() }),
    ).toBeEnabled();
  });

  it('on a terminal failure, says the invitation is unavailable and disables Accept', async () => {
    getChurchInvitationReviewStatus.mockResolvedValue(REDEEMABLE);
    acceptChurchInvitation.mockResolvedValue({
      kind: 'terminal-failure',
      reason: 'INVITATION_UNAVAILABLE',
    });
    const { user } = await setup();

    await clickAccept(user);

    expect(
      await screen.findByText(m.ministry_invitation_unavailable_description()),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: m.ministry_invitation_accept() }),
    ).toBeDisabled();
  });

  it('asks for confirmation, calls the public decline, and shows the declined state', async () => {
    getChurchInvitationReviewStatus.mockResolvedValue(REDEEMABLE);
    declineChurchInvitation.mockResolvedValue({ kind: 'declined' });
    const { user } = await setup();

    await user.click(
      await screen.findByRole('button', {
        name: m.ministry_invitation_decline(),
      }),
    );
    expect(declineChurchInvitation).not.toHaveBeenCalled();
    expect(
      screen.getByText(m.church_invitation_review_decline_notice()),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', {
        name: m.ministry_invitation_decline_confirm(),
      }),
    );

    expect(declineChurchInvitation).toHaveBeenCalledWith('invitation-1');
    expect(await screen.findByText(m.join_declined_title())).toBeVisible();
    expect(
      screen.queryByRole('button', { name: m.ministry_invitation_accept() }),
    ).toBeNull();
  });

  it('cancels the decline confirmation without calling the API', async () => {
    getChurchInvitationReviewStatus.mockResolvedValue(REDEEMABLE);
    const { user } = await setup();

    await user.click(
      await screen.findByRole('button', {
        name: m.ministry_invitation_decline(),
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: m.ministry_invitation_decline_cancel(),
      }),
    );

    expect(declineChurchInvitation).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: m.ministry_invitation_accept() }),
    ).toBeEnabled();
  });
});
