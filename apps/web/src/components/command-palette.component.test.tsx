import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './command-palette';
import { useCallerRoles } from '@/shared/hooks/use-caller-roles';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/shared/hooks/use-caller-roles', () => ({
  useCallerRoles: vi.fn(),
}));

// The desktop dialog path (isDesktop === true) is what search.spec.ts drove
// via a real 1280px viewport — pin the same width here.
window.matchMedia = ((query: string) => ({
  matches: query.includes('min-width'),
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
})) as unknown as typeof window.matchMedia;

const mockedUseCallerRoles = vi.mocked(useCallerRoles);

describe('CommandPalette (#219, right-sized from search.spec.ts)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('filters commands by query and shows a "Go to X" link for each match', async () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: false,
      isResolving: false,
    });
    const onOpenChange = vi.fn();
    render(<CommandPalette open onOpenChange={onOpenChange} />);

    const input = screen.getByPlaceholderText('Type a command or search...');
    await waitFor(() => expect(input).toHaveFocus());

    const user = userEvent.setup();
    await user.type(input, 'dashboard');

    const resultLink = screen.getByRole('link', { name: /Go to Dashboard/ });
    expect(resultLink).toBeVisible();
    expect(resultLink).toHaveAttribute('href', '/dashboard');
    expect(
      screen.queryByRole('link', { name: /Go to Availability/ }),
    ).not.toBeInTheDocument();
  });

  it('shows "No results found" when the query matches nothing', async () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: false,
      isResolving: false,
    });
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText('Type a command or search...'),
      'nonexistent-command',
    );

    expect(screen.getByText('No results found.')).toBeVisible();
  });

  it('closes and navigates when a result is clicked', async () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: false,
      isResolving: false,
    });
    const onOpenChange = vi.fn();
    render(<CommandPalette open onOpenChange={onOpenChange} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: /Go to Dashboard/ }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on Escape', async () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: false,
      isResolving: false,
    });
    const onOpenChange = vi.fn();
    render(<CommandPalette open onOpenChange={onOpenChange} />);

    const user = userEvent.setup();
    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('only lists Scheduling for a caller who can see it', async () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: true,
      isResolving: false,
    });
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(
      screen.getByRole('link', { name: /Go to Scheduling/ }),
    ).toBeVisible();
  });

  it('renders nothing when closed', () => {
    mockedUseCallerRoles.mockReturnValue({
      canSeeScheduling: false,
      isResolving: false,
    });
    const { container } = render(
      <CommandPalette open={false} onOpenChange={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
