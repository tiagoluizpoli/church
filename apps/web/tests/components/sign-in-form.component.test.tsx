import { m } from '@church/i18n/messages';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SignInForm from '@/components/sign-in-form';
import { renderWithProviders } from '@/tests/setup/render';

const mockSignInEmail = vi.fn();
const mockToastError = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
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

describe('SignInForm Better Auth error messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps INVALID_EMAIL_OR_PASSWORD to the pt-BR catalog message', async () => {
    simulateAuthError('INVALID_EMAIL_OR_PASSWORD');
    renderWithProviders(<SignInForm />);

    await userEvent.type(screen.getByLabelText(/email/i), 'user@example.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpassword');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        m.auth_error_invalid_email_or_password(),
      );
    });
  });

  it('falls back to common_generic_error for an unknown error code', async () => {
    simulateAuthError('SOME_UNKNOWN_CODE');
    renderWithProviders(<SignInForm />);

    await userEvent.type(screen.getByLabelText(/email/i), 'user@example.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'somepassword1');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(m.common_generic_error());
    });
  });
});
