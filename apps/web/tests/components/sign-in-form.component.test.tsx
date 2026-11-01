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
    useSession: () => ({ isPending: false }),
    // biome-ignore lint/style/useNamingConvention: matches Better Auth API shape
    $ERROR_CODES: {},
  },
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
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

  it('shows catalog validation errors and the catalog success toast', async () => {
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
    await userEvent.clear(screen.getByLabelText(m.auth_password_label()));
    await userEvent.type(
      screen.getByLabelText(m.auth_password_label()),
      'longenough1',
    );
    await userEvent.click(
      screen.getByRole('button', { name: m.auth_sign_in_submit() }),
    );
    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith(m.auth_sign_in_success()),
    );
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

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        m.auth_error_invalid_email_or_password(),
      );
    });
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

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(m.common_generic_error());
    });
  });
});
