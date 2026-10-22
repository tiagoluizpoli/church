import { m } from '@church/i18n/messages';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UserMenu from '@/components/user-menu';
import { authClient } from '@/lib/auth-client';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: vi.fn(),
    signOut: vi.fn(),
  },
}));

const mockedUseSession = vi.mocked(authClient.useSession);

function renderUserMenu() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <UserMenu />
    </QueryClientProvider>,
  );
}

describe('UserMenu (F8)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading skeleton while the session is pending', () => {
    mockedUseSession.mockReturnValue({ data: null, isPending: true } as never);

    const { container } = renderUserMenu();

    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  });

  it('shows a Sign In link when there is no session', () => {
    mockedUseSession.mockReturnValue({
      data: null,
      isPending: false,
    } as never);

    renderUserMenu();

    expect(
      screen.getByRole('link', { name: m.user_menu_sign_in() }),
    ).toHaveAttribute('href', '/login');
  });

  it('shows name and email in the menu label', async () => {
    mockedUseSession.mockReturnValue({
      data: { user: { name: 'Ana Admin', email: 'ana@example.com' } },
      isPending: false,
    } as never);

    renderUserMenu();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', {
        name: m.user_menu_account_label({ name: 'Ana Admin' }),
      }),
    );

    expect(await screen.findByText('Ana Admin')).toBeVisible();
    expect(screen.getByText('ana@example.com')).toBeVisible();
  });

  it('renders exactly one menu item — Sign Out — with no Church/Local Time control', async () => {
    mockedUseSession.mockReturnValue({
      data: { user: { name: 'Ana Church Admin', email: 'ana@example.com' } },
      isPending: false,
    } as never);

    renderUserMenu();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', {
        name: m.user_menu_account_label({ name: 'Ana Church Admin' }),
      }),
    );

    const menuItems = await screen.findAllByRole('menuitem');
    expect(menuItems.map((item) => item.textContent)).toEqual([
      m.user_menu_sign_out(),
    ]);
    expect(
      screen.queryByRole('menuitem', { name: /Church Time|Local Time/ }),
    ).not.toBeInTheDocument();
  });

  it('calls sign out when the Sign Out menu item is clicked', async () => {
    mockedUseSession.mockReturnValue({
      data: { user: { name: 'Leo Leader', email: 'leo@example.com' } },
      isPending: false,
    } as never);

    renderUserMenu();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', {
        name: m.user_menu_account_label({ name: 'Leo Leader' }),
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: m.user_menu_sign_out() }),
    );

    await waitFor(() =>
      expect(authClient.signOut).toHaveBeenCalledWith(
        expect.objectContaining({ fetchOptions: expect.anything() }),
      ),
    );
  });
});
