import { screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/__tests__/setup/render-route';

const getSession = vi.fn();
const getVolunteerDashboard = vi.fn();
const getActiveChurchStatus = vi
  .fn()
  .mockResolvedValue({ status: 'resolved', churchId: 'church-1' });
const previewChurchInvitation = vi.fn();
const requestChurchInvitationVerificationCode = vi.fn();
const redeemChurchInvitation = vi.fn();
const getVolunteerTransferPreview = vi.fn();
const confirmVolunteerTransfer = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    useSession: () => ({ isPending: false }),
    organization: {
      getActiveMember: vi.fn(),
    },
  },
}));

vi.mock('@/utils/api-instances', () => ({
  volunteerApi: {
    getVolunteerDashboard: (...args: unknown[]) =>
      getVolunteerDashboard(...args),
  },
  activeChurchApi: {
    getActiveChurchStatus: (...args: unknown[]) =>
      getActiveChurchStatus(...args),
  },
  redemptionApi: {
    previewChurchInvitation: (...args: unknown[]) =>
      previewChurchInvitation(...args),
    requestChurchInvitationVerificationCode: (...args: unknown[]) =>
      requestChurchInvitationVerificationCode(...args),
    redeemChurchInvitation: (...args: unknown[]) =>
      redeemChurchInvitation(...args),
    getVolunteerTransferPreview: (...args: unknown[]) =>
      getVolunteerTransferPreview(...args),
    confirmVolunteerTransfer: (...args: unknown[]) =>
      confirmVolunteerTransfer(...args),
  },
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

const PREVIEW = {
  email: 'invitee@example.test',
  churchName: 'St. Peter',
  ministryName: 'Worship',
  ministryAccessLevel: 'volunteer' as const,
  roleNames: ['Singer'],
  expiresAt: '2099-01-01T00:00:00.000Z',
};

function notFoundError(): AxiosError {
  return new AxiosError('Not Found', undefined, undefined, undefined, {
    status: 404,
    data: { error: 'INVITATION_UNAVAILABLE' },
  } as never);
}

describe('the chained-invitation redemption route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders only the permitted preview fields with the email read-only', async () => {
    previewChurchInvitation.mockResolvedValue(PREVIEW);

    renderRoute({ initialPath: '/invitations/church/invitation-1' });

    expect(await screen.findByText('Join St. Peter')).toBeVisible();
    expect(screen.getByText(/Worship/)).toBeVisible();
    const emailInput = screen.getByLabelText('Email') as HTMLInputElement;
    expect(emailInput.value).toBe('invitee@example.test');
    expect(emailInput).toBeDisabled();
  });

  it('shows an unavailable message for an expired or unknown invitation', async () => {
    previewChurchInvitation.mockRejectedValue(notFoundError());

    renderRoute({ initialPath: '/invitations/church/invitation-1' });

    expect(await screen.findByText(/no longer available/i)).toBeVisible();
  });

  it('requests a verification code and enters a resend cooldown', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    previewChurchInvitation.mockResolvedValue(PREVIEW);
    requestChurchInvitationVerificationCode.mockResolvedValue({
      status: 'sent',
    });

    renderRoute({ initialPath: '/invitations/church/invitation-1' });
    const user = userEvent.setup();

    const sendButton = await screen.findByRole('button', {
      name: 'Send code',
    });
    await user.click(sendButton);

    expect(requestChurchInvitationVerificationCode).toHaveBeenCalledWith(
      'invitation-1',
    );
    expect(
      await screen.findByRole('button', { name: /Resend in \d+s/ }),
    ).toBeDisabled();
  });

  it('resumes at code entry on a fresh mount rather than restarting — a reload never re-gates name/password/code behind a prior step', async () => {
    // Interrupted new-account journeys resume at email verification (spec
    // §7.3): the route has no separate "step" state to lose on reload — a
    // fresh mount always presents name, password and the code field
    // together, so a code already sent in an earlier tab/session before the
    // reload is still enough to finish, with no "Send code" click required.
    previewChurchInvitation.mockResolvedValue(PREVIEW);
    redeemChurchInvitation.mockResolvedValue({
      kind: 'full-success',
      volunteerId: 'volunteer-1',
    });
    getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });
    getVolunteerDashboard.mockResolvedValue({
      availabilityTasks: [],
      upcomingAssignmentGroups: [],
      unreadNotificationCount: 0,
      notificationPreview: [],
      defaultMinistryId: undefined,
      ministryOptions: [],
    });

    const { default: userEvent } = await import('@testing-library/user-event');
    const { router } = renderRoute({
      initialPath: '/invitations/church/invitation-1',
    });
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: /Join/ });
    expect(screen.getByLabelText('Name')).toBeEnabled();
    expect(screen.getByLabelText('Password')).toBeEnabled();
    expect(screen.getByPlaceholderText('123456')).toBeEnabled();
    expect(requestChurchInvitationVerificationCode).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Name'), 'New Volunteer');
    await user.type(
      screen.getByLabelText('Password'),
      'correct-horse-battery-staple',
    );
    await user.type(screen.getByPlaceholderText('123456'), '654321');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
    expect(requestChurchInvitationVerificationCode).not.toHaveBeenCalled();
  });

  it('on full success, refreshes the session and navigates directly to the dashboard', async () => {
    previewChurchInvitation.mockResolvedValue(PREVIEW);
    redeemChurchInvitation.mockResolvedValue({
      kind: 'full-success',
      volunteerId: 'volunteer-1',
    });
    getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });
    getVolunteerDashboard.mockResolvedValue({
      availabilityTasks: [],
      upcomingAssignmentGroups: [],
      unreadNotificationCount: 0,
      notificationPreview: [],
      defaultMinistryId: undefined,
      ministryOptions: [],
    });

    const { default: userEvent } = await import('@testing-library/user-event');
    const { router } = renderRoute({
      initialPath: '/invitations/church/invitation-1',
    });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Name'), 'New Volunteer');
    await user.type(
      screen.getByLabelText('Password'),
      'correct-horse-battery-staple',
    );
    await user.type(screen.getByPlaceholderText('123456'), '123456');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
    expect(getSession).toHaveBeenCalled();
  });

  it('on a terminal verification failure, clears the stale code and keeps Join enabled to retry', async () => {
    previewChurchInvitation.mockResolvedValue(PREVIEW);
    redeemChurchInvitation.mockResolvedValue({
      kind: 'terminal-failure',
      reason: 'VERIFICATION_FAILED',
    });

    const { default: userEvent } = await import('@testing-library/user-event');
    renderRoute({ initialPath: '/invitations/church/invitation-1' });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Name'), 'New Volunteer');
    await user.type(
      screen.getByLabelText('Password'),
      'correct-horse-battery-staple',
    );
    const codeInput = screen.getByPlaceholderText('123456') as HTMLInputElement;
    await user.type(codeInput, '000000');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByText("That code didn't work")).toBeVisible();
    await waitFor(() => expect(codeInput.value).toBe(''));
    expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled();
  });

  it('on a retryable ministry-acceptance failure, keeps Join enabled without clearing the code', async () => {
    previewChurchInvitation.mockResolvedValue(PREVIEW);
    redeemChurchInvitation.mockResolvedValue({
      kind: 'retryable-failure',
      reason: 'MINISTRY_ACCEPTANCE_FAILED',
    });

    const { default: userEvent } = await import('@testing-library/user-event');
    renderRoute({ initialPath: '/invitations/church/invitation-1' });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Name'), 'New Volunteer');
    await user.type(
      screen.getByLabelText('Password'),
      'correct-horse-battery-staple',
    );
    const codeInput = screen.getByPlaceholderText('123456') as HTMLInputElement;
    await user.type(codeInput, '123456');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByText('Something went wrong')).toBeVisible();
    expect(codeInput.value).toBe('123456');
    expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled();
  });

  it('on a non-retryable terminal failure, disables Join so the caller cannot resubmit a doomed request', async () => {
    previewChurchInvitation.mockResolvedValue(PREVIEW);
    redeemChurchInvitation.mockResolvedValue({
      kind: 'terminal-failure',
      reason: 'INVITATION_UNAVAILABLE',
    });

    const { default: userEvent } = await import('@testing-library/user-event');
    renderRoute({ initialPath: '/invitations/church/invitation-1' });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Name'), 'New Volunteer');
    await user.type(
      screen.getByLabelText('Password'),
      'correct-horse-battery-staple',
    );
    await user.type(screen.getByPlaceholderText('123456'), '123456');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(
      await screen.findByText('This invitation is no longer available'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled();
  });

  it('on an identity failure, shows a retry-eligible message', async () => {
    previewChurchInvitation.mockResolvedValue(PREVIEW);
    redeemChurchInvitation.mockResolvedValue({
      kind: 'terminal-failure',
      reason: 'IDENTITY_FAILED',
    });

    const { default: userEvent } = await import('@testing-library/user-event');
    renderRoute({ initialPath: '/invitations/church/invitation-1' });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Name'), 'New Volunteer');
    await user.type(
      screen.getByLabelText('Password'),
      'correct-horse-battery-staple',
    );
    await user.type(screen.getByPlaceholderText('123456'), '123456');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(
      await screen.findByText("We couldn't create your account"),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled();
  });

  async function redeemToSplit() {
    previewChurchInvitation.mockResolvedValue(PREVIEW);
    redeemChurchInvitation.mockResolvedValue({
      kind: 'church-only',
      sourceChurchName: 'Riverside Fellowship',
      destinationChurchName: 'St. Peter',
      ministryInvitationId: 'invitation-1',
    });
    const { default: userEvent } = await import('@testing-library/user-event');
    renderRoute({ initialPath: '/invitations/church/invitation-1' });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'New Volunteer');
    await user.type(
      screen.getByLabelText('Password'),
      'correct-horse-battery-staple',
    );
    await user.type(screen.getByPlaceholderText('123456'), '123456');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    return user;
  }

  it('on the cross-Church split, offers the transfer naming both Churches', async () => {
    await redeemToSplit();

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

  it('walks all three transfer layers and confirms only on an exact name + password', async () => {
    getVolunteerTransferPreview.mockResolvedValue({
      kind: 'reviewable',
      sourceChurchName: 'Riverside Fellowship',
      destinationChurchName: 'St. Peter',
      endedMemberships: [{ ministryName: 'Hospitality' }],
      withdrawnAssignments: [
        {
          eventName: 'Transfer Sunday',
          timeSlotStart: '2099-02-01T09:00:00.000Z',
          roleName: 'Greeter',
        },
      ],
    });
    confirmVolunteerTransfer.mockResolvedValue({
      kind: 'transferred',
      destinationVolunteerId: 'vol-new',
    });
    getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });
    getVolunteerDashboard.mockResolvedValue({
      availabilityTasks: [],
      upcomingAssignmentGroups: [],
      unreadNotificationCount: 0,
      notificationPreview: [],
      defaultMinistryId: undefined,
      ministryOptions: [],
    });

    const user = await redeemToSplit();

    // Layer 1 → 2
    await user.click(
      await screen.findByRole('button', { name: /Move my Volunteer profile/ }),
    );
    expect(await screen.findByText('Hospitality')).toBeVisible();
    expect(screen.getByText(/Transfer Sunday/)).toBeVisible();

    // Continue is gated on the acknowledgement checkbox.
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);

    // Layer 3 — wrong name keeps Confirm disabled.
    const confirmButton = await screen.findByRole('button', {
      name: 'Confirm Volunteer Transfer',
    });
    await user.type(screen.getByLabelText('Password'), 'correct-horse-staple');
    await user.type(
      screen.getByLabelText(/Type .* to confirm/),
      'Wrong Church',
    );
    expect(confirmButton).toBeDisabled();
    expect(confirmVolunteerTransfer).not.toHaveBeenCalled();

    // Exact name enables it.
    await user.clear(screen.getByLabelText(/Type .* to confirm/));
    await user.type(screen.getByLabelText(/Type .* to confirm/), 'St. Peter');
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    expect(confirmVolunteerTransfer).toHaveBeenCalledWith(
      'invitation-1',
      expect.objectContaining({
        destinationChurchName: 'St. Peter',
        password: 'correct-horse-staple',
      }),
    );
  });

  it('shows an inline error on a password mismatch and stays on the confirm step', async () => {
    getVolunteerTransferPreview.mockResolvedValue({
      kind: 'reviewable',
      sourceChurchName: 'Riverside Fellowship',
      destinationChurchName: 'St. Peter',
      endedMemberships: [],
      withdrawnAssignments: [],
    });
    confirmVolunteerTransfer.mockResolvedValue({ kind: 'password-mismatch' });

    const user = await redeemToSplit();
    await user.click(
      await screen.findByRole('button', { name: /Move my Volunteer profile/ }),
    );
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.type(screen.getByLabelText(/Type .* to confirm/), 'St. Peter');
    await user.click(
      screen.getByRole('button', { name: 'Confirm Volunteer Transfer' }),
    );

    expect(await screen.findByText(/password did not match/i)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Confirm Volunteer Transfer' }),
    ).toBeVisible();
  });
});
