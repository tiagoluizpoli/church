import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/app-shell';
import { CallerCapabilitiesScopeProvider } from '@/shared/components/caller-capabilities-scope';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';
import { activeChurchApiMock } from '@/tests/setup/active-church';
import { renderWithProviders } from '@/tests/setup/render';

const parked = vi.hoisted(() => ({ on: true }));

vi.mock('@church/app-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@church/app-config')>();
  const allOn = actual.withAllParkedOn(actual.appConfig);
  return {
    ...actual,
    appConfig: {
      ...actual.appConfig,
      get parked() {
        return parked.on ? allOn.parked : actual.appConfig.parked;
      },
    },
  };
});

let mockPathname = '/dashboard';
let mockHref = '/dashboard';
const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ({ pathname: mockPathname, href: mockHref }),
  useNavigate: () => mockNavigate,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false }),
  },
}));

vi.mock('@/shared/hooks/use-caller-capabilities', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/shared/hooks/use-caller-capabilities')
  >()),
  useCallerCapabilities: vi.fn(),
}));

vi.mock('@/utils/api-instances', async () => {
  const { activeChurchApiMock } = await import('@/tests/setup/active-church');
  return { activeChurchApi: activeChurchApiMock };
});

const mockedUseCallerCapabilities = vi.mocked(useCallerCapabilities);

// CommandPalette (rendered but closed by default) probes viewport width on
// mount; jsdom has no real matchMedia implementation.
window.matchMedia =
  window.matchMedia ??
  ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

function church(churchId: string, name: string) {
  return {
    churchId,
    name,
    timezone: 'UTC',
    accessLevel: 'church_admin',
    availableAreas: ['dashboard'],
    lastOpenedAt: null,
  };
}

const CHURCH_A = church('church-1', 'Igreja Esperança');
const CHURCH_B = church('church-2', 'Igreja Graça');

function asChurches(...churches: ReturnType<typeof church>[]) {
  activeChurchApiMock.listActiveChurchOptions.mockResolvedValue({ churches });
}

function renderShell() {
  return renderWithProviders(
    <CallerCapabilitiesScopeProvider churchId="church-1" userId="user-1">
      <AppShell notificationBell={<span data-testid="bell-slot" />}>
        content
      </AppShell>
    </CallerCapabilitiesScopeProvider>,
  );
}

beforeEach(() => {
  asChurches(CHURCH_A);
});

function navLabels(landmark: HTMLElement): (string | undefined)[] {
  return within(landmark)
    .getAllByRole('link')
    .map((link) => link.textContent?.trim());
}

async function findDrawerNav(): Promise<HTMLElement> {
  const drawer = await screen.findByTestId('mobile-drawer-content');
  return within(drawer).getByRole('navigation');
}

interface PersonaInput {
  isChurchAdmin?: boolean;
  leadsMinistries?: boolean;
  hasVolunteerMembership?: boolean;
  isResolving?: boolean;
}

function asPersona({
  isChurchAdmin = false,
  leadsMinistries = false,
  hasVolunteerMembership = false,
  isResolving = false,
}: PersonaInput = {}) {
  mockedUseCallerCapabilities.mockReturnValue({
    isChurchAdmin,
    leadsMinistries,
    hasVolunteerMembership,
    isResolving,
  });
}

const HOME = m.nav_home();
const SERVING = [m.nav_my_schedule(), m.nav_availability()];
const SCHEDULES = [m.nav_schedules()];
const CHURCH_LEADER = [m.nav_ministries(), m.nav_people(), m.nav_invitations()];
const ADMIN_SCHEDULING = [
  m.nav_schedules(),
  m.nav_cycles(),
  m.nav_event_templates(),
];
const HEADINGS = [
  m.nav_group_serving(),
  m.nav_group_scheduling(),
  m.nav_group_church(),
];

// h-12 = 12 * 4px = 48px against this repo's unmodified default Tailwind
// spacing scale, at or above the 44px touch-target minimum.
const TOUCH_TARGET_HEIGHT_CLASS = /\bh-12\b/;

const PERSONAS: {
  name: string;
  persona: PersonaInput;
  labels: string[];
  headings: string[];
}[] = [
  { name: 'plain member', persona: {}, labels: [HOME], headings: [] },
  {
    name: 'Volunteer',
    persona: { hasVolunteerMembership: true },
    labels: [HOME, ...SERVING],
    headings: [m.nav_group_serving()],
  },
  {
    name: 'leader only',
    persona: { leadsMinistries: true },
    labels: [HOME, ...SCHEDULES, ...CHURCH_LEADER],
    headings: [m.nav_group_scheduling(), m.nav_group_church()],
  },
  {
    name: 'leader who serves',
    persona: { leadsMinistries: true, hasVolunteerMembership: true },
    labels: [HOME, ...SERVING, ...SCHEDULES, ...CHURCH_LEADER],
    headings: HEADINGS,
  },
  {
    name: 'admin who does not serve',
    persona: { isChurchAdmin: true },
    labels: [HOME, ...ADMIN_SCHEDULING, ...CHURCH_LEADER],
    headings: [m.nav_group_scheduling(), m.nav_group_church()],
  },
  {
    name: 'admin who serves',
    persona: { isChurchAdmin: true, hasVolunteerMembership: true },
    labels: [HOME, ...SERVING, ...ADMIN_SCHEDULING, ...CHURCH_LEADER],
    headings: HEADINGS,
  },
];

describe('AppShell flat nav per persona (F7)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockPathname = '/dashboard';
    mockHref = '/dashboard';
  });

  it.each(
    PERSONAS,
  )('shows the right entries and headings for $name, same in sidebar and drawer', async ({
    persona,
    labels,
    headings,
  }) => {
    asPersona(persona);

    renderShell();

    const sidebar = screen.getByTestId('sidebar');
    expect(navLabels(sidebar)).toEqual(labels);
    for (const heading of HEADINGS) {
      expect(within(sidebar).queryByText(heading) !== null).toBe(
        headings.includes(heading),
      );
    }

    await userEvent.setup().click(screen.getByTestId('mobile-drawer-trigger'));
    expect(navLabels(await findDrawerNav())).toEqual(labels);
  });

  it.each([
    ['loading', { isResolving: true }],
    ['error', {}],
  ])('shows only Home while capabilities are %s', (_state, persona) => {
    asPersona(persona);

    renderShell();

    expect(navLabels(screen.getByTestId('sidebar'))).toEqual([HOME]);
  });

  it('renders the supplied notification bell slot', () => {
    asPersona();

    renderShell();

    expect(screen.getAllByTestId('bell-slot').length).toBeGreaterThan(0);
  });

  it('has no mobile bottom bar', () => {
    asPersona();

    renderShell();

    expect(screen.queryByTestId('mobile-bottom-nav')).not.toBeInTheDocument();
  });

  it('marks the entry active on a nested path, in sidebar and drawer', async () => {
    asPersona({ isChurchAdmin: true });
    mockPathname = '/cycles/cycle-1/edit';

    renderShell();

    const current = (nav: HTMLElement) =>
      within(nav)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page')
        .map((link) => link.textContent?.trim());
    expect(current(screen.getByTestId('sidebar'))).toEqual([m.nav_cycles()]);

    await userEvent.setup().click(screen.getByTestId('mobile-drawer-trigger'));
    expect(current(await findDrawerNav())).toEqual([m.nav_cycles()]);
  });

  it.each(['/', '/dashboard'])('marks Home active on %s', (pathname) => {
    asPersona();
    mockPathname = pathname;

    renderShell();

    expect(
      within(screen.getByTestId('sidebar')).getByRole('link', { name: HOME }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('marks Availability active on /volunteer/availability', () => {
    asPersona({ hasVolunteerMembership: true });
    mockPathname = '/volunteer/availability';

    renderShell();

    expect(
      within(screen.getByTestId('sidebar')).getByRole('link', {
        name: m.nav_availability(),
      }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('targets Home at / and never shows a Dashboard entry', () => {
    asPersona();

    renderShell();

    expect(
      within(screen.getByTestId('sidebar')).getByRole('link', { name: HOME }),
    ).toHaveAttribute('href', '/');
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('keeps translated accessible names on icon-only entries when collapsed, with headings hidden', async () => {
    asPersona({ isChurchAdmin: true, hasVolunteerMembership: true });

    renderShell();
    await userEvent.setup().click(screen.getByTestId('sidebar-toggle'));

    const sidebar = screen.getByTestId('sidebar');
    for (const heading of HEADINGS) {
      expect(within(sidebar).queryByText(heading)).not.toBeInTheDocument();
    }
    expect(
      within(sidebar).getByRole('link', { name: m.nav_cycles() }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: m.nav_expand_sidebar() }),
    ).toBeInTheDocument();
  });

  it('sizes drawer links at or above the 44px touch-target minimum', async () => {
    asPersona({ isChurchAdmin: true });

    renderShell();
    await userEvent.setup().click(screen.getByTestId('mobile-drawer-trigger'));

    for (const link of within(await findDrawerNav()).getAllByRole('link')) {
      expect(link.className).toMatch(TOUCH_TARGET_HEIGHT_CLASS);
    }
  });

  it('names the menu button in pt-BR', () => {
    asPersona();

    renderShell();

    expect(
      screen.getByRole('button', { name: m.nav_open_menu() }),
    ).toBeInTheDocument();
  });

  it('shows a caller-supplied breadcrumb override in place of the raw id segment', () => {
    asPersona({ isChurchAdmin: true });
    mockPathname = '/cycles/cycle-1';

    renderWithProviders(
      <AppShell
        notificationBell={null}
        breadcrumbOverrides={[{ segment: 'cycle-1', label: 'August 2026' }]}
      >
        content
      </AppShell>,
    );

    const breadcrumbs = screen.getByTestId('breadcrumbs');
    expect(within(breadcrumbs).getByText(HOME)).toBeVisible();
    expect(within(breadcrumbs).getByText(m.nav_cycles())).toBeVisible();
    expect(within(breadcrumbs).getByText('August 2026')).toBeVisible();
  });

  it('hides an opaque id segment from breadcrumbs when no override is supplied', () => {
    asPersona({ isChurchAdmin: true });
    mockPathname = '/cycles/cycle-1';

    renderShell();

    const breadcrumbs = screen.getByTestId('breadcrumbs');
    expect(within(breadcrumbs).getByText(m.nav_cycles())).toBeVisible();
    expect(within(breadcrumbs).queryByText('cycle-1')).not.toBeInTheDocument();
  });
});

describe('AppShell desktop sidebar collapse', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockPathname = '/dashboard';
    mockHref = '/dashboard';
  });

  it('flips the toggle label and collapsed markup on each click, round-tripping back to expanded', async () => {
    asPersona();

    renderShell();
    const user = userEvent.setup();
    const toggle = screen.getByTestId('sidebar-toggle');
    const sidebar = screen.getByTestId('sidebar');

    expect(screen.getByRole('button', { name: m.nav_collapse_sidebar() })).toBe(
      toggle,
    );
    expect(await within(sidebar).findByText(CHURCH_A.name)).toBeVisible();

    await user.click(toggle);

    expect(screen.getByRole('button', { name: m.nav_expand_sidebar() })).toBe(
      toggle,
    );
    expect(within(sidebar).queryByText(CHURCH_A.name)).not.toBeInTheDocument();

    await user.click(toggle);

    expect(screen.getByRole('button', { name: m.nav_collapse_sidebar() })).toBe(
      toggle,
    );
    expect(await within(sidebar).findByText(CHURCH_A.name)).toBeVisible();
  });
});

describe('AppShell responsive visibility contract', () => {
  it('hides the desktop sidebar and shows the mobile header below md, and the reverse above it', () => {
    asPersona();

    renderShell();

    expect(screen.getByTestId('sidebar').className).toContain('md:flex');
    expect(screen.getByTestId('sidebar').className).toContain('hidden');
    expect(screen.getByTestId('mobile-top-header').className).toContain(
      'md:hidden',
    );
  });
});

describe('AppShell command palette shortcut (#219, right-sized from search.spec.ts)', () => {
  afterEach(() => {
    parked.on = true;
    vi.clearAllMocks();
    mockPathname = '/dashboard';
    mockHref = '/dashboard';
  });

  it('opens the command palette on Ctrl+K and closes it on a second press', async () => {
    asPersona();

    renderShell();

    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();

    await userEvent.keyboard('{Control>}k{/Control}');
    expect(await screen.findByTestId('command-palette')).toBeVisible();

    await userEvent.keyboard('{Control>}k{/Control}');
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
  });

  it('shows no Search button and ignores Ctrl+K while the palette is parked', async () => {
    parked.on = false;
    asPersona();

    renderShell();

    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
  });
});

describe('AppShell Switch Church control', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockPathname = '/dashboard';
    mockHref = '/dashboard';
  });

  it('navigates to select-church with the full path, query, and hash preserved as the redirect target', async () => {
    asPersona({ isChurchAdmin: true });
    asChurches(CHURCH_A, CHURCH_B);
    mockPathname = '/cycles';
    mockHref = '/cycles?view=board#upcoming';

    renderShell();
    const user = userEvent.setup();
    await user.click(
      await within(screen.getByTestId('sidebar')).findByRole('button', {
        name: m.nav_switch_church(),
      }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/select-church?redirect=%2Fcycles%3Fview%3Dboard%23upcoming',
    });
  });

  it('navigates to select-church from the mobile drawer and closes the drawer', async () => {
    asPersona();
    asChurches(CHURCH_A, CHURCH_B);
    mockHref = '/dashboard';

    renderShell();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('mobile-drawer-trigger'));
    const drawer = await screen.findByTestId('mobile-drawer-content');

    await user.click(
      await within(drawer).findByRole('button', {
        name: m.nav_switch_church(),
      }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/select-church?redirect=%2Fdashboard',
    });
  });

  it('keeps the Switch Church control reachable and functional when the sidebar is collapsed', async () => {
    asPersona();
    asChurches(CHURCH_A, CHURCH_B);
    mockHref = '/dashboard';

    renderShell();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('sidebar-toggle'));

    const switchChurchButton = await within(
      screen.getByTestId('sidebar'),
    ).findByRole('button', { name: m.nav_switch_church() });
    expect(
      switchChurchButton.querySelector('.lucide-users-round'),
    ).not.toBeNull();

    await user.click(switchChurchButton);

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/select-church?redirect=%2Fdashboard',
    });
  });
});

describe('AppShell Church header (F9)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('names the Active Church, hides the switch control with one Church, and drops the old product strings', async () => {
    asPersona();
    renderShell();

    const sidebar = screen.getByTestId('sidebar');
    expect(await within(sidebar).findByText(CHURCH_A.name)).toBeVisible();
    expect(
      within(sidebar).queryByRole('button', { name: m.nav_switch_church() }),
    ).toBeNull();
    expect(screen.queryByText('Church CRM')).toBeNull();
    expect(screen.queryByText('Scheduling workspace')).toBeNull();
  });

  it('names the Church matching the route context, not the first option', async () => {
    asPersona();
    asChurches(CHURCH_B, CHURCH_A);
    renderShell();

    const sidebar = screen.getByTestId('sidebar');
    expect(await within(sidebar).findByText(CHURCH_A.name)).toBeVisible();
    expect(within(sidebar).queryByText(CHURCH_B.name)).toBeNull();
  });

  it('shows the switch control with two Churches', async () => {
    asPersona();
    asChurches(CHURCH_A, CHURCH_B);
    renderShell();

    expect(
      await within(screen.getByTestId('sidebar')).findByRole('button', {
        name: m.nav_switch_church(),
      }),
    ).toBeVisible();
  });

  it('shows no switch control, name or old strings while loading', () => {
    asPersona();
    activeChurchApiMock.listActiveChurchOptions.mockReturnValue(
      new Promise(() => {}),
    );
    renderShell();

    const sidebar = screen.getByTestId('sidebar');
    expect(
      within(sidebar).queryByRole('button', { name: m.nav_switch_church() }),
    ).toBeNull();
    expect(within(sidebar).getByTestId('church-name-skeleton')).toBeVisible();
    expect(screen.queryByText('Church CRM')).toBeNull();
  });

  it('shows no switch control when the options call fails', async () => {
    asPersona();
    activeChurchApiMock.listActiveChurchOptions.mockRejectedValue(
      new Error('boom'),
    );
    renderShell();

    await waitFor(() =>
      expect(activeChurchApiMock.listActiveChurchOptions).toHaveBeenCalled(),
    );
    expect(
      screen.queryByRole('button', { name: m.nav_switch_church() }),
    ).toBeNull();
  });
});
