import { m } from '@church/i18n/messages';
import { screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getSession = vi.fn();
const getVolunteerDashboard = vi.fn();
const previewChurchInvitation = vi.fn();
const requestChurchInvitationVerificationCode = vi.fn();
const redeemChurchInvitation = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    useSession: () => ({ isPending: false }),
    organization: {
      getActiveMember: vi.fn(),
    },
  },
}));

vi.mock('@/utils/api-instances', async () => ({
  volunteerApi: {
    getVolunteerDashboard: (...args: unknown[]) =>
      getVolunteerDashboard(...args),
  },
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
  redemptionApi: {
    previewChurchInvitation: (...args: unknown[]) =>
      previewChurchInvitation(...args),
    requestChurchInvitationVerificationCode: (...args: unknown[]) =>
      requestChurchInvitationVerificationCode(...args),
    redeemChurchInvitation: (...args: unknown[]) =>
      redeemChurchInvitation(...args),
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

const PLAIN_PREVIEW = {
  email: 'first-admin@example.test',
  churchName: 'St. Peter',
  churchAccessLevel: 'admin' as const,
  expiresAt: '2099-01-01T00:00:00.000Z',
};

const PAIRED_PREVIEW = {
  email: 'invitee@example.test',
  churchName: 'St. Peter',
  churchAccessLevel: 'member' as const,
  expiresAt: '2099-01-01T00:00:00.000Z',
  ministry: {
    invitationId: 'ministry-invitation-1',
    name: 'Worship',
    ministryAccessLevel: 'leader' as const,
    roleNames: ['Singer', 'Guitar'],
  },
};

const INITIAL_PATH = '/invitations/church/church-invitation-1';

function axiosErrorWithStatus(status: number): AxiosError {
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    status,
    data: {},
  } as never);
}

const EMPTY_DASHBOARD = {
  availabilityTasks: [],
  upcomingAssignmentGroups: [],
  unreadNotificationCount: 0,
  notificationPreview: [],
  defaultMinistryId: undefined,
  ministryOptions: [],
};

async function openStepTwo() {
  const { default: userEvent } = await import('@testing-library/user-event');
  requestChurchInvitationVerificationCode.mockResolvedValue({ status: 'sent' });
  const rendered = renderRoute({
    initialPath: INITIAL_PATH,
    churchTimezone: 'UTC',
  });
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: m.join_send_code() }),
  );
  await screen.findByLabelText(m.join_code_label());
  return { user, ...rendered };
}

interface FillJoinFormInput {
  user: Awaited<ReturnType<typeof openStepTwo>>['user'];
  password?: string;
}

async function fillAndJoin({
  user,
  password = 'correct-horse-battery-staple',
}: FillJoinFormInput): Promise<void> {
  await user.type(screen.getByLabelText(m.join_code_label()), '123456');
  await user.type(screen.getByLabelText(m.join_name_label()), 'New Person');
  await user.type(screen.getByLabelText(m.join_password_label()), password);
  await user.click(screen.getByRole('button', { name: m.join_submit() }));
}

describe('the public Church Invitation join route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });
    getVolunteerDashboard.mockResolvedValue(EMPTY_DASHBOARD);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a plain first-admin invitation in step 1 with Send code and no Ministry or decline button', async () => {
    previewChurchInvitation.mockResolvedValue(PLAIN_PREVIEW);

    renderRoute({ initialPath: INITIAL_PATH, churchTimezone: 'UTC' });

    expect(
      await screen.findByRole('heading', {
        name: m.join_title({ churchName: 'St. Peter' }),
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        m.join_church_access({ accessLevel: m.join_church_access_admin() }),
      ),
    ).toBeVisible();
    const email = screen.getByLabelText(
      m.join_email_label(),
    ) as HTMLInputElement;
    expect(email.value).toBe('first-admin@example.test');
    expect(email).toHaveAttribute('readonly');
    expect(
      screen.getByRole('button', { name: m.join_send_code() }),
    ).toBeEnabled();
    expect(
      screen.queryByLabelText(m.join_name_label()),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Worship/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /recus|declin/i })).toBeNull();
    expect(previewChurchInvitation).toHaveBeenCalledWith('church-invitation-1');
  });

  it('shows the paired Ministry, its Ministry Access Level and Roles', async () => {
    previewChurchInvitation.mockResolvedValue(PAIRED_PREVIEW);

    renderRoute({ initialPath: INITIAL_PATH, churchTimezone: 'UTC' });

    expect(
      await screen.findByText(
        m.join_ministry_access({
          ministryName: 'Worship',
          accessLevel: m.join_ministry_access_leader(),
        }),
      ),
    ).toBeVisible();
    expect(
      screen.getByText(m.join_ministry_roles({ roles: 'Singer, Guitar' })),
    ).toBeVisible();
  });

  it('explains an unavailable invitation and offers Log in', async () => {
    previewChurchInvitation.mockRejectedValue(axiosErrorWithStatus(404));

    renderRoute({ initialPath: INITIAL_PATH, churchTimezone: 'UTC' });

    expect(
      await screen.findByText(m.redemption_failure_unavailable_title()),
    ).toBeVisible();
    expect(
      screen.getByText(m.redemption_failure_unavailable_description()),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: m.join_log_in() })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('keeps throttling distinct from an unavailable invitation', async () => {
    previewChurchInvitation.mockRejectedValue(axiosErrorWithStatus(429));

    renderRoute({ initialPath: INITIAL_PATH, churchTimezone: 'UTC' });

    expect(await screen.findByText(m.join_too_many_requests())).toBeVisible();
    expect(
      screen.queryByText(m.redemption_failure_unavailable_title()),
    ).not.toBeInTheDocument();
  });

  it('moves to step 2 after Send code, keeps the email fixed and starts the resend cooldown', async () => {
    previewChurchInvitation.mockResolvedValue(PAIRED_PREVIEW);

    await openStepTwo();

    expect(requestChurchInvitationVerificationCode).toHaveBeenCalledWith(
      'church-invitation-1',
    );
    expect(
      screen.getByText(m.join_code_sent({ email: 'invitee@example.test' })),
    ).toBeVisible();
    expect(screen.getByLabelText(m.join_name_label())).toBeEnabled();
    expect(screen.getByLabelText(m.join_password_label())).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /Reenviar em \d+s/ }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('textbox', { name: m.join_email_label() }),
    ).toBeNull();
  });

  it('stays on step 1 and says Too many requests when the code request is throttled', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    previewChurchInvitation.mockResolvedValue(PLAIN_PREVIEW);
    requestChurchInvitationVerificationCode.mockRejectedValue(
      axiosErrorWithStatus(429),
    );
    renderRoute({ initialPath: INITIAL_PATH, churchTimezone: 'UTC' });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: m.join_send_code() }),
    );

    expect(await screen.findByText(m.join_too_many_requests())).toBeVisible();
    expect(
      screen.queryByLabelText(m.join_code_label()),
    ).not.toBeInTheDocument();
  });

  it('refuses a password shorter than eight characters without submitting', async () => {
    previewChurchInvitation.mockResolvedValue(PLAIN_PREVIEW);
    const { user } = await openStepTwo();

    await fillAndJoin({ user, password: 'short' });

    expect(await screen.findByText(m.join_validation_password())).toBeVisible();
    expect(redeemChurchInvitation).not.toHaveBeenCalled();
  });

  it('joins a plain invitation and continues to Home', async () => {
    previewChurchInvitation.mockResolvedValue(PLAIN_PREVIEW);
    redeemChurchInvitation.mockResolvedValue({
      kind: 'full-success',
      volunteerId: null,
    });
    const { user, router } = await openStepTwo();

    await fillAndJoin({ user });

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(redeemChurchInvitation).toHaveBeenCalledWith(
      'church-invitation-1',
      expect.objectContaining({ code: '123456', name: 'New Person' }),
    );
    expect(getSession).toHaveBeenCalled();
  });

  it('continues a Church-only join to Home carrying the Church and Ministry names', async () => {
    previewChurchInvitation.mockResolvedValue(PAIRED_PREVIEW);
    redeemChurchInvitation.mockResolvedValue({
      kind: 'church-only',
      sourceChurchName: 'Riverside Fellowship',
      destinationChurchId: 'church-1',
      destinationChurchName: 'St. Peter',
      ministryInvitationId: 'ministry-invitation-1',
      ministryName: 'Worship',
    });
    const { user, router } = await openStepTwo();

    await fillAndJoin({ user });

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toMatchObject({
      joinedChurch: 'St. Peter',
      invitedMinistry: 'Worship',
    });
  });

  it('after a failed code, clears it and offers a new code', async () => {
    previewChurchInvitation.mockResolvedValue(PLAIN_PREVIEW);
    redeemChurchInvitation.mockResolvedValue({
      kind: 'terminal-failure',
      reason: 'VERIFICATION_FAILED',
    });
    const { user } = await openStepTwo();

    await fillAndJoin({ user });

    expect(
      await screen.findByText(m.redemption_failure_code_title()),
    ).toBeVisible();
    const code = screen.getByLabelText(m.join_code_label()) as HTMLInputElement;
    await waitFor(() => expect(code.value).toBe(''));
    expect(screen.getByRole('button', { name: m.join_submit() })).toBeEnabled();
  });

  it('offers Try again after a retryable failure without clearing the code', async () => {
    previewChurchInvitation.mockResolvedValue(PAIRED_PREVIEW);
    redeemChurchInvitation.mockResolvedValue({
      kind: 'retryable-failure',
      reason: 'IDENTITY_FAILED',
    });
    const { user } = await openStepTwo();

    await fillAndJoin({ user });

    expect(
      await screen.findByText(m.redemption_failure_retryable_description()),
    ).toBeVisible();
    expect(
      (screen.getByLabelText(m.join_code_label()) as HTMLInputElement).value,
    ).toBe('123456');
    expect(
      screen.getByRole('button', { name: 'Tente novamente' }),
    ).toBeEnabled();
  });

  it('tells a recipient whose email already has a login to ask their inviter, without a retry', async () => {
    previewChurchInvitation.mockResolvedValue(PLAIN_PREVIEW);
    redeemChurchInvitation.mockResolvedValue({
      kind: 'terminal-failure',
      reason: 'EMAIL_ALREADY_REGISTERED',
    });
    const { user } = await openStepTwo();

    await fillAndJoin({ user });

    expect(
      await screen.findByText(
        'Este email já tem uma conta; fale com quem convidou você.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: m.join_submit() }),
    ).toBeDisabled();
  });

  it('disables Join when the invitation became unavailable mid-join', async () => {
    previewChurchInvitation.mockResolvedValue(PLAIN_PREVIEW);
    redeemChurchInvitation.mockResolvedValue({
      kind: 'terminal-failure',
      reason: 'INVITATION_UNAVAILABLE',
    });
    const { user } = await openStepTwo();

    await fillAndJoin({ user });

    expect(
      await screen.findByText(m.redemption_failure_unavailable_title()),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: m.join_submit() }),
    ).toBeDisabled();
  });
});
