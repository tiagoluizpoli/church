import { m } from '@church/i18n/messages';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SignUpForm from '@/components/sign-up-form';
import { renderWithProviders } from '@/tests/setup/render';

const mockUseSession = vi.fn();

beforeEach(() => {
  mockUseSession.mockReturnValue({ isPending: false });
});

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signUp: { email: vi.fn() },
    useSession: () => mockUseSession(),
    // biome-ignore lint/style/useNamingConvention: matches Better Auth API shape
    $ERROR_CODES: {},
  },
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

describe('SignUpForm pt-BR copy', () => {
  it('renders the heading, labels, submit and switch link from the catalog', () => {
    renderWithProviders(<SignUpForm onSwitchToSignIn={vi.fn()} />);

    expect(
      screen.getByRole('heading', { name: m.auth_sign_up_title() }),
    ).toBeVisible();
    expect(screen.getByLabelText(m.auth_sign_up_name_label())).toBeVisible();
    expect(
      screen.getByLabelText(m.password_recovery_email_label()),
    ).toBeVisible();
    expect(screen.getByLabelText(m.auth_password_label())).toBeVisible();
    expect(
      screen.getByRole('button', { name: m.auth_sign_up_submit() }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: m.auth_sign_up_switch_to_sign_in() }),
    ).toBeVisible();
  });

  it('shows catalog validation messages on an empty submit', async () => {
    renderWithProviders(<SignUpForm onSwitchToSignIn={vi.fn()} />);

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: m.auth_sign_up_submit() }));

    expect(
      await screen.findByText(m.auth_sign_up_name_too_short()),
    ).toBeVisible();
    expect(screen.getByText(m.password_recovery_invalid_email())).toBeVisible();
    expect(
      screen.getByText(m.password_recovery_password_too_short()),
    ).toBeVisible();
  });
});

describe('SignUpForm session check', () => {
  it('shows a labelled form skeleton after the delay while the session check is pending', async () => {
    mockUseSession.mockReturnValue({ isPending: true });
    renderWithProviders(<SignUpForm onSwitchToSignIn={vi.fn()} />);

    const loading = screen.getByRole('status', {
      name: m.auth_session_loading(),
    });
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(loading.querySelector('[data-slot="skeleton"]')).toBeNull();
    await waitFor(() => {
      expect(loading.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    });
    expect(
      screen.queryByRole('heading', { name: m.auth_sign_up_title() }),
    ).toBeNull();
  });
});
