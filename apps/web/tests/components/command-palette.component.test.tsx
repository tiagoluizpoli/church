import { m } from '@church/i18n/messages';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from '@/components/command-palette';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/shared/hooks/use-caller-capabilities', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/shared/hooks/use-caller-capabilities')
  >()),
  useCallerCapabilities: vi.fn(),
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

const mockedUseCallerCapabilities = vi.mocked(useCallerCapabilities);

describe('CommandPalette (#219, right-sized from search.spec.ts)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('filters commands by query and shows a "Go to X" link for each match', async () => {
    mockedUseCallerCapabilities.mockReturnValue({
      isChurchAdmin: false,
      leadsMinistries: false,
      hasVolunteerMembership: false,
      ledMinistryIds: [],
      isResolving: false,
      isError: false,
      retry: vi.fn(),
    });
    const onOpenChange = vi.fn();
    render(<CommandPalette open onOpenChange={onOpenChange} />);

    const input = screen.getByPlaceholderText(m.shell_search_placeholder());
    await waitFor(() => expect(input).toHaveFocus());

    const user = userEvent.setup();
    await user.type(input, m.nav_home().toLowerCase());

    const resultLink = screen.getByRole('link', {
      name: new RegExp(m.shell_search_go_to({ label: m.nav_home() })),
    });
    expect(resultLink).toBeVisible();
    expect(resultLink).toHaveAttribute('href', '/');
    expect(
      screen.queryByRole('link', {
        name: new RegExp(m.shell_search_go_to({ label: m.nav_availability() })),
      }),
    ).not.toBeInTheDocument();
  });

  it('shows "No results found" when the query matches nothing', async () => {
    mockedUseCallerCapabilities.mockReturnValue({
      isChurchAdmin: false,
      leadsMinistries: false,
      hasVolunteerMembership: false,
      ledMinistryIds: [],
      isResolving: false,
      isError: false,
      retry: vi.fn(),
    });
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText(m.shell_search_placeholder()),
      'nonexistent-command',
    );

    expect(screen.getByText(m.shell_search_no_results())).toBeVisible();
  });

  it('closes and navigates when a result is clicked', async () => {
    mockedUseCallerCapabilities.mockReturnValue({
      isChurchAdmin: false,
      leadsMinistries: false,
      hasVolunteerMembership: false,
      ledMinistryIds: [],
      isResolving: false,
      isError: false,
      retry: vi.fn(),
    });
    const onOpenChange = vi.fn();
    render(<CommandPalette open onOpenChange={onOpenChange} />);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('link', {
        name: new RegExp(m.shell_search_go_to({ label: m.nav_home() })),
      }),
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on Escape', async () => {
    mockedUseCallerCapabilities.mockReturnValue({
      isChurchAdmin: false,
      leadsMinistries: false,
      hasVolunteerMembership: false,
      ledMinistryIds: [],
      isResolving: false,
      isError: false,
      retry: vi.fn(),
    });
    const onOpenChange = vi.fn();
    render(<CommandPalette open onOpenChange={onOpenChange} />);

    const user = userEvent.setup();
    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('only lists Scheduling for a caller who can see it', async () => {
    mockedUseCallerCapabilities.mockReturnValue({
      isChurchAdmin: true,
      leadsMinistries: false,
      hasVolunteerMembership: false,
      ledMinistryIds: [],
      isResolving: false,
      isError: false,
      retry: vi.fn(),
    });
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(
      screen.getByRole('link', {
        name: new RegExp(
          m.shell_search_go_to({ label: m.nav_group_scheduling() }),
        ),
      }),
    ).toBeVisible();
  });

  it('renders nothing when closed', () => {
    mockedUseCallerCapabilities.mockReturnValue({
      isChurchAdmin: false,
      leadsMinistries: false,
      hasVolunteerMembership: false,
      ledMinistryIds: [],
      isResolving: false,
      isError: false,
      retry: vi.fn(),
    });
    const { container } = render(
      <CommandPalette open={false} onOpenChange={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
