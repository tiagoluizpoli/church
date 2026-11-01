import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/tests/setup/render-route';

interface SignOutOptions {
  fetchOptions: { onSuccess: () => void };
}

const getSession = vi.fn();
const signOut = vi.fn();
const getMinistryInvitationStatus = vi.fn();
const acceptMinistryInvitation = vi.fn();
const declineMinistryInvitation = vi.fn();
const getVolunteerTransferPreview = vi.fn();
const confirmVolunteerTransfer = vi.fn();
const listActiveChurchOptions = vi.fn();
const selectActiveChurch = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    signOut: (...args: unknown[]) => signOut(...args),
    useSession: () => ({ isPending: false }),
  },
}));

vi.mock('@/utils/api-instances', () => ({
  redemptionApi: {
    getMinistryInvitationStatus: (...args: unknown[]) =>
      getMinistryInvitationStatus(...args),
    acceptMinistryInvitation: (...args: unknown[]) =>
      acceptMinistryInvitation(...args),
    declineMinistryInvitation: (...args: unknown[]) =>
      declineMinistryInvitation(...args),
    getVolunteerTransferPreview: (...args: unknown[]) =>
      getVolunteerTransferPreview(...args),
    confirmVolunteerTransfer: (...args: unknown[]) =>
      confirmVolunteerTransfer(...args),
  },
  activeChurchApi: {
    listActiveChurchOptions: (...args: unknown[]) =>
      listActiveChurchOptions(...args),
    selectActiveChurch: (...args: unknown[]) => selectActiveChurch(...args),
  },
}));

const REDEEMABLE = {
  kind: 'redeemable' as const,
  invitationKind: 'ministry-only' as const,
  email: 'existing-member@example.test',
  churchName: 'St. Peter',
  ministryName: 'Care',
  ministryAccessLevel: 'volunteer' as const,
  roleNames: ['Host'],
  expiresAt: '2099-01-01T00:00:00.000Z',
};

const CHURCH_OPTION = {
  churchId: 'church-1',
  name: 'St. Peter',
  timezone: 'UTC',
  accessLevel: 'member' as const,
  availableAreas: ['dashboard' as const],
  lastOpenedAt: null,
};

describe('the existing-member Ministry Invitation redemption route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { user: { id: 'u1' }, session: {} },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders on a plain-HTTP origin without crypto.randomUUID', async () => {
    // Plain HTTP off localhost (a LAN IP or `*.dev.home.arpa`) is not a
    // secure context: the browser has `getRandomValues` but no `randomUUID`.
    vi.stubGlobal('crypto', {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });
    getMinistryInvitationStatus.mockResolvedValue(REDEEMABLE);

    renderRoute({ initialPath: '/invitations/ministry/invitation-1' });

    expect(
      await screen.findByText(
        m.ministry_invitation_title({ ministryName: 'Care' }),
      ),
    ).toBeVisible();
  });

  it('renders within the app shell with Ministry, Ministry Access Level and Roles', async () => {
    getMinistryInvitationStatus.mockResolvedValue(REDEEMABLE);

    renderRoute({ initialPath: '/invitations/ministry/invitation-1' });

    expect(
      await screen.findByText(
        m.ministry_invitation_title({ ministryName: 'Care' }),
      ),
    ).toBeVisible();
    expect(
      screen.getByText(m.ministry_invitation_ministry_label()),
    ).toBeVisible();
    expect(screen.getByText('Care', { selector: 'dd' })).toBeVisible();
    expect(
      screen.getByText(m.ministry_invitation_access_level_label()),
    ).toBeVisible();
    expect(
      screen.getByText(m.ministry_invitation_access_volunteer()),
    ).toBeVisible();
    expect(screen.getByText('Host')).toBeVisible();
    expect(screen.queryByLabelText('Email')).toBeNull();
    // Home › Ministry invitation, not the raw path segments.
    const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(within(breadcrumb).getByText(m.nav_home())).toBeVisible();
    expect(
      within(breadcrumb).getByText(m.breadcrumb_ministry_invitation()),
    ).toBeVisible();
    expect(within(breadcrumb).queryByText(m.nav_invitations())).toBeNull();
  });

  it('shows Leader access and no Roles for a leader invitation without Roles', async () => {
    getMinistryInvitationStatus.mockResolvedValue({
      ...REDEEMABLE,
      ministryAccessLevel: 'leader',
      roleNames: [],
    });

    renderRoute({ initialPath: '/invitations/ministry/invitation-1' });

    expect(
      await screen.findByText(m.ministry_invitation_access_leader()),
    ).toBeVisible();
    expect(screen.getByText(m.ministry_invitation_roles_none())).toBeVisible();
  });

  it('on accept, continues to Home with the destination Church active', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    getMinistryInvitationStatus.mockResolvedValue(REDEEMABLE);
    acceptMinistryInvitation.mockResolvedValue({
      kind: 'full-success',
      volunteerId: 'volunteer-1',
    });
    listActiveChurchOptions.mockResolvedValue({ churches: [CHURCH_OPTION] });
    selectActiveChurch.mockResolvedValue({ churchId: 'church-1' });

    const { router } = renderRoute({
      initialPath: '/invitations/ministry/invitation-1',
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', {
        name: m.ministry_invitation_accept(),
      }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(router.state.location.search).toMatchObject({
      joinedMinistry: 'Care',
    });
    expect(selectActiveChurch).not.toHaveBeenCalled();
  });

  it('on the cross-Church split, renders the Volunteer Transfer flow naming both Churches', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    getMinistryInvitationStatus.mockResolvedValue(REDEEMABLE);
    acceptMinistryInvitation.mockResolvedValue({
      kind: 'church-only',
      sourceChurchName: 'Riverside Fellowship',
      destinationChurchId: 'church-1',
      destinationChurchName: 'St. Peter',
      ministryInvitationId: 'invitation-1',
    });

    renderRoute({ initialPath: '/invitations/ministry/invitation-1' });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', {
        name: m.ministry_invitation_accept(),
      }),
    );

    expect(
      await screen.findByRole('heading', {
        name: m.volunteer_transfer_split_title({ churchName: 'St. Peter' }),
      }),
    ).toBeVisible();
    expect(screen.getAllByText(/Riverside Fellowship/).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByRole('button', { name: m.volunteer_transfer_move_action() }),
    ).toBeVisible();
  });

  // #214 — the Volunteer Transfer flow's own confirmation-layer gating
  // (review acknowledgement, name-match, password length) is isolated
  // component interaction (spec's Testing Decisions), so it belongs here
  // rather than being the sole proof carried by the E2E journey
  // (tests/identity/volunteer-transfer-journey.spec.ts), which stays scoped
  // to the real cross-boundary walk.
  it('gates the review and confirm layers until acknowledged, name-matched, and password-length valid', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    getMinistryInvitationStatus.mockResolvedValue(REDEEMABLE);
    acceptMinistryInvitation.mockResolvedValue({
      kind: 'church-only',
      sourceChurchName: 'Riverside Fellowship',
      destinationChurchId: 'church-1',
      destinationChurchName: 'St. Peter',
      ministryInvitationId: 'invitation-1',
    });
    getVolunteerTransferPreview.mockResolvedValue({
      kind: 'reviewable',
      sourceChurchName: 'Riverside Fellowship',
      destinationChurchName: 'St. Peter',
      endedMemberships: [{ ministryName: 'Youth' }],
      withdrawnAssignments: [],
    });
    confirmVolunteerTransfer.mockResolvedValue({
      kind: 'transferred',
      destinationVolunteerId: 'volunteer-2',
    });

    const { router } = renderRoute({
      initialPath: '/invitations/ministry/invitation-1',
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', {
        name: m.ministry_invitation_accept(),
      }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: m.volunteer_transfer_move_action(),
      }),
    );

    const continueButton = await screen.findByRole('button', {
      name: m.volunteer_transfer_continue(),
    });
    expect(continueButton).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);

    const confirmButton = await screen.findByRole('button', {
      name: m.volunteer_transfer_confirm_title(),
    });
    expect(confirmButton).toBeDisabled();

    await user.type(
      screen.getByLabelText(m.volunteer_transfer_password_label()),
      'short',
    );
    await user.type(
      screen.getByLabelText(
        m.volunteer_transfer_type_name({ churchName: 'St. Peter' }),
      ),
      'Not St. Peter',
    );
    expect(confirmButton).toBeDisabled();

    await user.clear(
      screen.getByLabelText(m.volunteer_transfer_password_label()),
    );
    await user.type(
      screen.getByLabelText(m.volunteer_transfer_password_label()),
      'a-strong-password',
    );
    await user.clear(
      screen.getByLabelText(
        m.volunteer_transfer_type_name({ churchName: 'St. Peter' }),
      ),
    );
    await user.type(
      screen.getByLabelText(
        m.volunteer_transfer_type_name({ churchName: 'St. Peter' }),
      ),
      'St. Peter',
    );
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });

  // #342 — the User now belongs to both Churches, so without an explicit
  // selection the dashboard guard would send them to /select-church.
  async function acceptIntoSplit() {
    const { default: userEvent } = await import('@testing-library/user-event');
    getMinistryInvitationStatus.mockResolvedValue(REDEEMABLE);
    acceptMinistryInvitation.mockResolvedValue({
      kind: 'church-only',
      sourceChurchName: 'Riverside Fellowship',
      destinationChurchId: 'church-1',
      destinationChurchName: 'St. Peter',
      ministryInvitationId: 'invitation-1',
    });
    listActiveChurchOptions.mockResolvedValue({ churches: [CHURCH_OPTION] });
    selectActiveChurch.mockResolvedValue({ churchId: 'church-1' });

    const { router } = renderRoute({
      initialPath: '/invitations/ministry/invitation-1',
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: m.ministry_invitation_accept(),
      }),
    );
    return { router, user };
  }

  it('after the transfer commits, continues to Home with the destination Church active', async () => {
    getVolunteerTransferPreview.mockResolvedValue({
      kind: 'reviewable',
      sourceChurchName: 'Riverside Fellowship',
      destinationChurchName: 'St. Peter',
      endedMemberships: [{ ministryName: 'Youth' }],
      withdrawnAssignments: [],
    });
    confirmVolunteerTransfer.mockResolvedValue({
      kind: 'transferred',
      destinationVolunteerId: 'volunteer-2',
    });
    const { router, user } = await acceptIntoSplit();

    await user.click(
      await screen.findByRole('button', {
        name: m.volunteer_transfer_move_action(),
      }),
    );
    await user.click(await screen.findByRole('checkbox'));
    await user.click(
      screen.getByRole('button', { name: m.volunteer_transfer_continue() }),
    );
    await user.type(
      await screen.findByLabelText(m.volunteer_transfer_password_label()),
      'a-strong-password',
    );
    await user.type(
      screen.getByLabelText(
        m.volunteer_transfer_type_name({ churchName: 'St. Peter' }),
      ),
      'St. Peter',
    );
    await user.click(
      screen.getByRole('button', {
        name: m.volunteer_transfer_confirm_title(),
      }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(selectActiveChurch).toHaveBeenCalledWith({ churchId: 'church-1' });
  });

  it('continuing as a member continues to Home with the destination Church active', async () => {
    const { router, user } = await acceptIntoSplit();

    await user.click(
      await screen.findByRole('button', {
        name: m.volunteer_transfer_continue_as_member({
          churchName: 'St. Peter',
        }),
      }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(selectActiveChurch).toHaveBeenCalledWith({ churchId: 'church-1' });
  });

  it('falls back to Home, selecting nothing, when an explicit Church is not among the caller options', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    getMinistryInvitationStatus.mockResolvedValue(REDEEMABLE);
    acceptMinistryInvitation.mockResolvedValue({
      kind: 'already-accepted',
      churchId: 'church-9',
    });
    listActiveChurchOptions.mockResolvedValue({ churches: [CHURCH_OPTION] });

    const { router } = renderRoute({
      initialPath: '/invitations/ministry/invitation-1',
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: m.ministry_invitation_accept(),
      }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(selectActiveChurch).not.toHaveBeenCalled();
  });

  it('on a double-submit race where the invitation was already accepted, still continues into the Church rather than stranding the caller', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    getMinistryInvitationStatus.mockResolvedValue(REDEEMABLE);
    acceptMinistryInvitation.mockResolvedValue({
      kind: 'already-accepted',
      churchId: 'church-1',
    });
    listActiveChurchOptions.mockResolvedValue({ churches: [CHURCH_OPTION] });
    selectActiveChurch.mockResolvedValue({ churchId: 'church-1' });

    const { router } = renderRoute({
      initialPath: '/invitations/ministry/invitation-1',
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', {
        name: m.ministry_invitation_accept(),
      }),
    );

    await waitFor(() => {
      expect(selectActiveChurch).toHaveBeenCalledWith({
        churchId: 'church-1',
      });
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });

  it('shows an inline retryable failure and keeps Accept enabled', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    getMinistryInvitationStatus.mockResolvedValue(REDEEMABLE);
    acceptMinistryInvitation.mockResolvedValue({
      kind: 'retryable-failure',
      reason: 'MINISTRY_ACCEPTANCE_FAILED',
    });

    renderRoute({ initialPath: '/invitations/ministry/invitation-1' });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', {
        name: m.ministry_invitation_accept(),
      }),
    );

    expect(
      await screen.findByText(m.common_generic_error_title()),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: m.ministry_invitation_accept() }),
    ).toBeEnabled();
  });

  it('requires explicit confirmation before declining, then continues Home with the declined result', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    getMinistryInvitationStatus.mockResolvedValue(REDEEMABLE);
    declineMinistryInvitation.mockResolvedValue({ kind: 'declined' });

    const { router } = renderRoute({
      initialPath: '/invitations/ministry/invitation-1',
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', {
        name: m.ministry_invitation_decline(),
      }),
    );
    expect(declineMinistryInvitation).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        m.ministry_invitation_decline_notice_ministry_only({
          ministryName: 'Care',
        }),
      ),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', {
        name: m.ministry_invitation_decline_confirm(),
      }),
    );

    expect(declineMinistryInvitation).toHaveBeenCalledWith('invitation-1');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(router.state.location.search).toMatchObject({
      invitationDeclined: true,
    });
  });

  it('cancels the decline confirmation without calling the API', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    getMinistryInvitationStatus.mockResolvedValue(REDEEMABLE);

    renderRoute({ initialPath: '/invitations/ministry/invitation-1' });
    const user = userEvent.setup();

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

    expect(declineMinistryInvitation).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('button', {
        name: m.ministry_invitation_decline(),
      }),
    ).toBeVisible();
  });

  it('warns that declining a chained invitation rejects both halves', async () => {
    getMinistryInvitationStatus.mockResolvedValue({
      ...REDEEMABLE,
      invitationKind: 'chained',
    });

    const { default: userEvent } = await import('@testing-library/user-event');
    renderRoute({ initialPath: '/invitations/ministry/invitation-1' });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', {
        name: m.ministry_invitation_decline(),
      }),
    );

    expect(
      screen.getByText(m.ministry_invitation_decline_notice_chained()),
    ).toBeVisible();
  });

  it('offers Continue to Church for an already-accepted invitation', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    getMinistryInvitationStatus.mockResolvedValue({
      kind: 'already-accepted',
      churchId: 'church-1',
    });
    listActiveChurchOptions.mockResolvedValue({ churches: [CHURCH_OPTION] });
    selectActiveChurch.mockResolvedValue({ churchId: 'church-1' });

    const { router } = renderRoute({
      initialPath: '/invitations/ministry/invitation-1',
    });
    const user = userEvent.setup();

    expect(
      await screen.findByText(m.ministry_invitation_already_accepted_title()),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', {
        name: new RegExp(m.ministry_invitation_continue_home()),
      }),
    );

    await waitFor(() => {
      expect(selectActiveChurch).toHaveBeenCalledWith({
        churchId: 'church-1',
      });
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });

  it('shows a wrong login only the masked addressed email and a Log out that returns to the invitation', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    getMinistryInvitationStatus.mockResolvedValue({
      kind: 'identity-mismatch',
      maskedEmail: 'e***@example.test',
    });
    // `/login`'s own beforeLoad redirects an already-authenticated visitor
    // straight back — signOut must clear the session getSession() reports,
    // same as the real authClient, or the redirect there bounces home.
    signOut.mockImplementation(({ fetchOptions }: SignOutOptions) => {
      getSession.mockResolvedValue({ data: null });
      fetchOptions.onSuccess();
    });

    const { router, container, queryClient } = renderRoute({
      initialPath: '/invitations/ministry/invitation-1',
    });
    const user = userEvent.setup();

    expect(
      await screen.findByText(
        m.ministry_invitation_wrong_login_description({
          maskedEmail: 'e***@example.test',
        }),
      ),
    ).toBeVisible();
    expect(container.textContent).not.toContain('existing-member@');
    expect(
      screen.queryByRole('button', { name: m.ministry_invitation_accept() }),
    ).toBeNull();
    const capabilityKey = ['caller-capabilities', 'u1', 'church-1'];
    queryClient.setQueryData(capabilityKey, { isChurchAdmin: true });

    await user.click(
      screen.getByRole('button', { name: m.ministry_invitation_logout() }),
    );

    await waitFor(() =>
      expect(queryClient.getQueryData(capabilityKey)).toBeUndefined(),
    );
    expect(signOut).toHaveBeenCalled();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(router.state.location.search).toEqual({
      redirect: '/invitations/ministry/invitation-1',
    });
    expect(acceptMinistryInvitation).not.toHaveBeenCalled();
    expect(declineMinistryInvitation).not.toHaveBeenCalled();
  });

  it('shows the agreed unavailable recovery with a Log in link back to the invitation', async () => {
    getMinistryInvitationStatus.mockResolvedValue({ kind: 'unavailable' });

    renderRoute({ initialPath: '/invitations/ministry/invitation-1' });

    expect(
      await screen.findByText(m.ministry_invitation_unavailable_description()),
    ).toBeVisible();
    const hrefs = screen
      .getAllByRole('link', { name: m.ministry_invitation_login() })
      .map((link) => link.getAttribute('href'));
    expect(hrefs).toContainEqual(
      expect.stringContaining(
        encodeURIComponent('/invitations/ministry/invitation-1'),
      ),
    );
  });

  it('keeps throttling distinct from unavailable and lets the person retry', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const throttled = Object.assign(new Error('throttled'), {
      isAxiosError: true,
      response: { status: 429 },
    });
    getMinistryInvitationStatus
      .mockRejectedValueOnce(throttled)
      .mockResolvedValueOnce(REDEEMABLE);

    renderRoute({ initialPath: '/invitations/ministry/invitation-1' });
    const user = userEvent.setup();

    expect(
      await screen.findByText(m.ministry_invitation_throttled_title()),
    ).toBeVisible();
    expect(
      screen.queryByText(m.ministry_invitation_unavailable_title()),
    ).toBeNull();

    await user.click(
      screen.getByRole('button', { name: m.ministry_invitation_retry() }),
    );

    expect(
      await screen.findByText(
        m.ministry_invitation_title({ ministryName: 'Care' }),
      ),
    ).toBeVisible();
  });

  it('renders the invitation in pt-BR from the catalog, with no gendered article before the Ministry name', async () => {
    getMinistryInvitationStatus.mockResolvedValue(REDEEMABLE);

    renderRoute({ initialPath: '/invitations/ministry/invitation-1' });

    expect(await screen.findByText('Convite para Care')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Aceitar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeVisible();
  });
});
