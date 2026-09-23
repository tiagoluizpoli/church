import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UserMenu from './user-menu';
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

describe('UserMenu (#219, right-sized from timezone.spec.ts)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading skeleton while the session is pending', () => {
    mockedUseSession.mockReturnValue({ data: null, isPending: true } as never);

    const { container } = render(<UserMenu />);

    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  });

  it('shows a Sign In link when there is no session', () => {
    mockedUseSession.mockReturnValue({
      data: null,
      isPending: false,
    } as never);

    render(<UserMenu />);

    expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('renders exactly one menu item — Sign Out — with no Church/Local Time control', async () => {
    mockedUseSession.mockReturnValue({
      data: { user: { name: 'Ana Church Admin', email: 'ana@example.com' } },
      isPending: false,
    } as never);

    render(<UserMenu />);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', {
        name: 'Account menu for Ana Church Admin',
      }),
    );

    const menuItems = await screen.findAllByRole('menuitem');
    expect(menuItems.map((item) => item.textContent)).toEqual(['Sign Out']);
    expect(
      screen.queryByRole('menuitem', { name: /Church Time|Local Time/ }),
    ).not.toBeInTheDocument();
  });

  it('signs out and offers no Church/Local Time affordance anywhere in the menu on click', async () => {
    mockedUseSession.mockReturnValue({
      data: { user: { name: 'Leo Leader', email: 'leo@example.com' } },
      isPending: false,
    } as never);

    render(<UserMenu />);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Account menu for Leo Leader' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Sign Out' }));

    await waitFor(() =>
      expect(authClient.signOut).toHaveBeenCalledWith(
        expect.objectContaining({ fetchOptions: expect.anything() }),
      ),
    );
  });
});
