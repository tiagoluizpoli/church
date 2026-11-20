import { m } from '@church/i18n/messages';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SignInForm from '@/components/sign-in-form';
import { renderWithProviders } from '@/tests/setup/render';

const mockSignInEmail = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockUseSession = vi.fn();
const mockNavigate = vi.fn();

beforeEach(() => {
  mockUseSession.mockReturnValue({ isPending: false });
});

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: {
      email: (...args: unknown[]) => mockSignInEmail(...args),
    },
    useSession: () => mockUseSession(),
    // biome-ignore lint/style/useNamingConvention: matches Better Auth API shape
    $ERROR_CODES: {},
  },
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

function simulateAuthError(code: string) {
  mockSignInEmail.mockImplementation(
    (
      _data: unknown,
      callbacks: { onError: (ctx: { error: { code: string } }) => void },
    ) => {
      callbacks.onError({ error: { code } });
    },
  );
}

describe('SignInForm pt-BR copy', () => {
  it('renders the heading, invitation-only note and labels from the catalog', () => {
    renderWithProviders(<SignInForm />);

    expect(
      screen.getByRole('heading', { name: m.auth_sign_in_title() }),
    ).toBeVisible();
    expect(screen.getByText(m.auth_sign_in_invitation_only())).toBeVisible();
    expect(
      screen.getByLabelText(m.password_recovery_email_label()),
    ).toBeVisible();
    expect(screen.getByLabelText(m.auth_password_label())).toBeVisible();
  });

  it('shows catalog validation errors, then signs in without a toast', async () => {
    renderWithProviders(<SignInForm />);
    await userEvent.type(
      screen.getByLabelText(m.password_recovery_email_label()),
      'user@example.test',
    );
    await userEvent.type(
      screen.getByLabelText(m.auth_password_label()),
      'short',
    );
    await userEvent.click(
      screen.getByRole('button', { name: m.auth_sign_in_submit() }),
    );
    expect(
      await screen.findByText(m.password_recovery_password_too_short()),
    ).toBeVisible();

    mockSignInEmail.mockImplementation(
      (_data: unknown, callbacks: { onSuccess: () => void }) =>
        callbacks.onSuccess(),
    );
    mockNavigate.mockClear();
    await userEvent.clear(screen.getByLabelText(m.auth_password_label()));
    await userEvent.type(
      screen.getByLabelText(m.auth_password_label()),
      'longenough1',
    );
    await userEvent.click(
      screen.getByRole('button', { name: m.auth_sign_in_submit() }),
    );
    // Arriving in the app is the confirmation.
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({ href: '/' }),
    );
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});

describe('SignInForm Better Auth error messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps INVALID_EMAIL_OR_PASSWORD to the pt-BR catalog message', async () => {
    simulateAuthError('INVALID_EMAIL_OR_PASSWORD');
    renderWithProviders(<SignInForm />);

    await userEvent.type(
      screen.getByLabelText(m.password_recovery_email_label()),
      'user@example.test',
    );
    await userEvent.type(
      screen.getByLabelText(m.auth_password_label()),
      'wrongpassword',
    );
    await userEvent.click(
      screen.getByRole('button', { name: m.auth_sign_in_submit() }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      m.auth_error_invalid_email_or_password(),
    );
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('falls back to common_generic_error for an unknown error code', async () => {
    simulateAuthError('SOME_UNKNOWN_CODE');
    renderWithProviders(<SignInForm />);

    await userEvent.type(
      screen.getByLabelText(m.password_recovery_email_label()),
      'user@example.test',
    );
    await userEvent.type(
      screen.getByLabelText(m.auth_password_label()),
      'somepassword1',
    );
    await userEvent.click(
      screen.getByRole('button', { name: m.auth_sign_in_submit() }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      m.common_generic_error(),
    );
    expect(mockToastError).not.toHaveBeenCalled();
  });
});

describe('SignInForm password visibility', () => {
  it('reveals and hides the password with a labelled toggle', async () => {
    renderWithProviders(<SignInForm />);
    const password = screen.getByLabelText(m.auth_password_label());
    const toggle = screen.getByRole('button', { name: m.auth_password_show() });

    expect(password).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(password).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(toggle);
    expect(password).toHaveAttribute('type', 'password');
  });
});

describe('SignInForm sign-up switch', () => {
  it('labels the switch-to-sign-up link from the catalog', () => {
    renderWithProviders(<SignInForm onSwitchToSignUp={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: m.auth_sign_in_switch_to_sign_up() }),
    ).toBeVisible();
  });
});

describe('SignInForm session check', () => {
  it('shows a labelled form skeleton after the delay while the session check is pending', async () => {
    mockUseSession.mockReturnValue({ isPending: true });
    renderWithProviders(<SignInForm />);

    const loading = screen.getByRole('status', {
      name: m.auth_session_loading(),
    });
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(loading.querySelector('[data-slot="skeleton"]')).toBeNull();
    await waitFor(() => {
      expect(loading.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    });
    expect(
      screen.queryByRole('heading', { name: m.auth_sign_in_title() }),
    ).toBeNull();
  });
});
