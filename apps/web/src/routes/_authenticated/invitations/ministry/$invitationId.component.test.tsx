import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/__tests__/setup/render-route';

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

  it('renders only the permitted preview fields, with the email read-only', async () => {
    getMinistryInvitationStatus.mockResolvedValue(REDEEMABLE);

    renderRoute({ initialPath: '/invitations/ministry/invitation-1' });

    expect(await screen.findByText('Join Care')).toBeVisible();
    expect(screen.getByText(/St\. Peter/)).toBeVisible();
    expect(screen.getByText(/Host/)).toBeVisible();
    const emailInput = screen.getByLabelText('Email') as HTMLInputElement;
    expect(emailInput.value).toBe('existing-member@example.test');
    expect(emailInput).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeVisible();
  });

  it('on accept, resolves the invited Church by name and continues into it', async () => {
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

    await user.click(await screen.findByRole('button', { name: 'Accept' }));

    await waitFor(() => {
      expect(selectActiveChurch).toHaveBeenCalledWith({
        churchId: 'church-1',
      });
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
  });

  it('on the cross-Church split, renders the Volunteer Transfer flow naming both Churches', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    getMinistryInvitationStatus.mockResolvedValue(REDEEMABLE);
    acceptMinistryInvitation.mockResolvedValue({
      kind: 'church-only',
      sourceChurchName: 'Riverside Fellowship',
      destinationChurchName: 'St. Peter',
      ministryInvitationId: 'invitation-1',
    });

    renderRoute({ initialPath: '/invitations/ministry/invitation-1' });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Accept' }));

    expect(
      await screen.findByRole('heading', {
        name: /You're a member of St\. Peter/,
      }),
    ).toBeVisible();
    expect(screen.getAllByText(/Riverside Fellowship/).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByRole('button', { name: /Move my Volunteer profile/ }),
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

    await user.click(await screen.findByRole('button', { name: 'Accept' }));
    await user.click(
      await screen.findByRole('button', { name: /Move my Volunteer profile/ }),
    );

    const continueButton = await screen.findByRole('button', {
      name: 'Continue',
    });
    expect(continueButton).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);

    const confirmButton = await screen.findByRole('button', {
      name: 'Confirm Volunteer Transfer',
    });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText('Password'), 'short');
    await user.type(
      screen.getByLabelText(/Type St\. Peter to confirm/),
      'Not St. Peter',
    );
    expect(confirmButton).toBeDisabled();

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'a-strong-password');
    await user.clear(screen.getByLabelText(/Type St\. Peter to confirm/));
    await user.type(
      screen.getByLabelText(/Type St\. Peter to confirm/),
      'St. Peter',
    );
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
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

    await user.click(await screen.findByRole('button', { name: 'Accept' }));

    await waitFor(() => {
      expect(selectActiveChurch).toHaveBeenCalledWith({
        churchId: 'church-1',
      });
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
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

    await user.click(await screen.findByRole('button', { name: 'Accept' }));

    expect(await screen.findByText('Something went wrong')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();
  });

  it('requires explicit confirmation before declining, with ministry-only copy', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    getMinistryInvitationStatus.mockResolvedValue(REDEEMABLE);
    declineMinistryInvitation.mockResolvedValue({ kind: 'declined' });

    renderRoute({ initialPath: '/invitations/ministry/invitation-1' });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Decline' }));
    expect(declineMinistryInvitation).not.toHaveBeenCalled();
    expect(screen.getByText(/only your invitation to Care/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Yes, decline' }));

    expect(declineMinistryInvitation).toHaveBeenCalledWith('invitation-1');
    expect(
      await screen.findByText("You've declined this invitation."),
    ).toBeVisible();
  });

  it('cancels the decline confirmation without calling the API', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    getMinistryInvitationStatus.mockResolvedValue(REDEEMABLE);

    renderRoute({ initialPath: '/invitations/ministry/invitation-1' });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Decline' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(declineMinistryInvitation).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('button', { name: 'Decline' }),
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

    await user.click(await screen.findByRole('button', { name: 'Decline' }));

    expect(
      screen.getByText(/also cancel your Church invitation/),
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
      await screen.findByText("You've already accepted this invitation"),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Continue to Church' }),
    );

    await waitFor(() => {
      expect(selectActiveChurch).toHaveBeenCalledWith({
        churchId: 'church-1',
      });
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
  });

  it('never reveals the invited email for a wrong signed-in account, and requires confirmation to switch', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    getMinistryInvitationStatus.mockResolvedValue({
      kind: 'identity-mismatch',
    });
    // `/login`'s own beforeLoad redirects an already-authenticated visitor
    // straight back — signOut must clear the session getSession() reports,
    // same as the real authClient, or the redirect there bounces home.
    signOut.mockImplementation(({ fetchOptions }: SignOutOptions) => {
      getSession.mockResolvedValue({ data: null });
      fetchOptions.onSuccess();
    });

    const { router, container } = renderRoute({
      initialPath: '/invitations/ministry/invitation-1',
    });
    const user = userEvent.setup();

    expect(
      await screen.findByText('This invitation belongs to another account'),
    ).toBeVisible();
    expect(container.textContent).not.toContain('@');

    await user.click(screen.getByRole('button', { name: 'Switch account' }));
    expect(signOut).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Sign out and switch' }),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Sign out and switch' }),
    );

    expect(signOut).toHaveBeenCalled();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(router.state.location.search).toEqual({
      redirect: '/invitations/ministry/invitation-1',
    });
  });

  it('shows a generic unavailable message for a nonexistent, expired, canceled or already-declined invitation', async () => {
    getMinistryInvitationStatus.mockResolvedValue({ kind: 'unavailable' });

    renderRoute({ initialPath: '/invitations/ministry/invitation-1' });

    expect(await screen.findByText(/no longer available/i)).toBeVisible();
  });
});
