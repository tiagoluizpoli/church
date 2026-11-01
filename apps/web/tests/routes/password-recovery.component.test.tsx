import { m } from '@church/i18n/messages';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getSession = vi.fn();
const requestPasswordReset = vi.fn();
const resetPassword = vi.fn();
const notifyStore = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    requestPasswordReset: (...args: unknown[]) => requestPasswordReset(...args),
    resetPassword: (...args: unknown[]) => resetPassword(...args),
    useSession: () => ({ isPending: false }),
    // biome-ignore lint/style/useNamingConvention: matches Better Auth API shape
    $store: { notify: (...args: unknown[]) => notifyStore(...args) },
  },
}));

vi.mock('@/utils/api-instances', async () => ({
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
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

const renderRecovery = (initialPath: string) =>
  renderRoute({ initialPath, churchTimezone: 'UTC' });

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ data: null });
});

describe('Login entry to recovery', () => {
  it('links Forgot password? to the public request form', async () => {
    const { router } = renderRecovery('/login');

    await userEvent.click(
      await screen.findByRole('link', {
        name: m.password_recovery_forgot_link(),
      }),
    );

    expect(router.state.location.pathname).toBe('/forgot-password');
  });

  it('shows the password-changed notice after a reset', async () => {
    renderRecovery('/login?notice=password-changed');

    expect(
      await screen.findByText(m.password_recovery_password_changed()),
    ).toBeVisible();
  });
});

describe('the forgot-password route', () => {
  it('renders standalone and confirms identically without revealing registration', async () => {
    requestPasswordReset.mockResolvedValue({
      data: { status: true },
      error: null,
    });
    renderRecovery('/forgot-password');

    await userEvent.type(
      await screen.findByLabelText(m.password_recovery_email_label()),
      'someone@example.test',
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: m.password_recovery_request_submit(),
      }),
    );

    expect(
      await screen.findByText(m.password_recovery_request_sent()),
    ).toBeVisible();
    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: 'someone@example.test',
      redirectTo: `${window.location.origin}/reset-password`,
    });
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('disables the button while pending, then offers a generic retry on failure', async () => {
    let rejectRequest: (value: unknown) => void = () => undefined;
    requestPasswordReset.mockReturnValue(
      new Promise((resolve) => {
        rejectRequest = resolve;
      }),
    );
    renderRecovery('/forgot-password');

    await userEvent.type(
      await screen.findByLabelText(m.password_recovery_email_label()),
      'someone@example.test',
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: m.password_recovery_request_submit(),
      }),
    );
    expect(
      await screen.findByRole('button', {
        name: m.password_recovery_request_submitting(),
      }),
    ).toBeDisabled();

    rejectRequest({ data: null, error: { status: 500 } });

    expect(
      await screen.findByText(m.password_recovery_request_failed()),
    ).toBeVisible();
    expect(
      screen.queryByText(m.password_recovery_request_sent()),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: m.password_recovery_request_submit(),
      }),
    ).toBeEnabled();
  });

  it('refuses an invalid email without calling the server', async () => {
    renderRecovery('/forgot-password');

    await userEvent.type(
      await screen.findByLabelText(m.password_recovery_email_label()),
      'not-an-email',
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: m.password_recovery_request_submit(),
      }),
    );

    expect(
      await screen.findByText(m.password_recovery_invalid_email()),
    ).toBeVisible();
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });
});

describe('the reset-password route', () => {
  const submitNewPassword = async (password: string) => {
    await userEvent.type(
      await screen.findByLabelText(m.password_recovery_new_password_label()),
      password,
    );
    await userEvent.click(
      screen.getByRole('button', { name: m.password_recovery_reset_submit() }),
    );
  };

  it('changes the password and returns to Login with the notice', async () => {
    resetPassword.mockResolvedValue({ data: { status: true }, error: null });
    const { router } = renderRecovery('/reset-password?token=abc');

    await submitNewPassword('brand-new-pass');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(resetPassword).toHaveBeenCalledWith({
      newPassword: 'brand-new-pass',
      token: 'abc',
    });
    expect(notifyStore).toHaveBeenCalledWith('$sessionSignal');
    expect(
      await screen.findByText(m.password_recovery_password_changed()),
    ).toBeVisible();
  });

  it('enforces the eight character minimum in the form', async () => {
    renderRecovery('/reset-password?token=abc');

    await submitNewPassword('short');

    expect(
      await screen.findByText(m.password_recovery_password_too_short()),
    ).toBeVisible();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('shows the expired-link recovery when the server refuses the token', async () => {
    resetPassword.mockResolvedValue({
      data: null,
      error: { status: 400, code: 'INVALID_TOKEN' },
    });
    renderRecovery('/reset-password?token=used');

    await submitNewPassword('brand-new-pass');

    expect(
      await screen.findByText(m.password_recovery_link_expired()),
    ).toBeVisible();
    expect(
      screen.getByRole('link', {
        name: m.password_recovery_request_new_link(),
      }),
    ).toHaveAttribute('href', '/forgot-password');
  });

  it('shows a localized message and keeps the form for a too-long password', async () => {
    resetPassword.mockResolvedValue({
      data: null,
      error: { status: 400, code: 'PASSWORD_TOO_LONG' },
    });
    renderRecovery('/reset-password?token=abc');

    await submitNewPassword('brand-new-pass');

    expect(
      await screen.findByText(m.auth_error_password_too_long()),
    ).toBeVisible();
  });

  it.each([
    ['a missing token', '/reset-password'],
    ['the callback error query', '/reset-password?error=INVALID_TOKEN'],
  ])('shows the expired-link recovery for %s', async (_name, path) => {
    renderRecovery(path);

    expect(
      await screen.findByText(m.password_recovery_link_expired()),
    ).toBeVisible();
    expect(
      screen.getByRole('link', {
        name: m.password_recovery_request_new_link(),
      }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText(m.password_recovery_new_password_label()),
    ).not.toBeInTheDocument();
  });
});

describe('pt-BR catalog', () => {
  const ptBR = { locale: 'pt-BR' } as const;

  it('ships the recovery copy in Portuguese', () => {
    expect(m.password_recovery_request_sent({}, ptBR)).toBe(
      'Se existir uma conta para este e-mail, enviamos um link.',
    );
    expect(m.password_recovery_link_expired({}, ptBR)).toBe(
      'Este link expirou. Solicite um novo.',
    );
    expect(m.password_recovery_password_changed({}, ptBR)).toBe(
      'Senha alterada. Entre com a sua nova senha.',
    );
    expect(m.password_recovery_forgot_link({}, ptBR)).toBe('Esqueceu a senha?');
  });
});
