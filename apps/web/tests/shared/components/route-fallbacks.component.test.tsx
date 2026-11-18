// biome-ignore-all lint/style/useNamingConvention: Sentry event fields are snake_case on the wire
import { m } from '@church/i18n/messages';
import * as Sentry from '@sentry/react';
import { Link } from '@tanstack/react-router';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initErrorReporting } from '@/shared/utils/error-reporting';
import {
  activeChurchApiMock,
  resolvedActiveChurchStatus,
} from '@/tests/setup/active-church';
import {
  callerCapabilitiesApiMock,
  callerCapabilitiesFixture,
} from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { serveTunnel } from '@/tests/setup/error-report-tunnel';
import { renderRoute } from '@/tests/setup/render-route';

// Home (`/`) stands in for any page: while `homeCrash` holds an error, its
// component throws it during render.
const reload = vi.hoisted(() => vi.fn());

// jsdom cannot stub `location`; the real guard still runs around this.
vi.mock('@/shared/utils/chunk-reload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/utils/chunk-reload')>()),
  reloadPage: reload,
}));

const page = vi.hoisted(() => ({
  homeCrash: null as Error | null,
  myScheduleCrash: null as Error | null,
}));

vi.mock('@/features/home/components/home-page', () => ({
  HomePage: () => {
    if (page.homeCrash) {
      throw page.homeCrash;
    }
    return <h1>Home content</h1>;
  },
}));

vi.mock('@/features/volunteers/components/my-schedule-page', () => ({
  MySchedulePage: () => {
    if (page.myScheduleCrash) {
      throw page.myScheduleCrash;
    }
    return <h1>My schedule content</h1>;
  },
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'u1' }, session: {} } }),
  },
}));

vi.mock('@/utils/api-instances', async () => ({
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
  callerCapabilitiesApi: (await import('@/tests/setup/caller-capabilities'))
    .callerCapabilitiesApiMock,
}));

// The shell's own chrome is not under test; one nav link proves it stays usable.
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: ChildrenProps) => (
    <>
      <nav>
        <Link to="/my-schedule">Shell nav link</Link>
      </nav>
      <main>{children}</main>
    </>
  ),
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

describe('route crash fallback', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    page.homeCrash = null;
    page.myScheduleCrash = null;
    callerCapabilitiesApiMock.getCallerCapabilities.mockReturnValue(
      new Promise(() => {}),
    );
  });

  it('renders a crashed page as the in-shell fallback and keeps shell navigation usable', async () => {
    page.homeCrash = new Error('boom');
    const { router } = renderRoute({ initialPath: '/', churchTimezone: 'UTC' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(m.shell_error_title());
    expect(
      screen.getByRole('heading', { name: m.shell_error_title() }),
    ).toHaveFocus();
    expect(screen.getByRole('main')).toContainElement(alert);

    await userEvent.click(screen.getByRole('link', { name: 'Shell nav link' }));

    expect(
      await screen.findByRole('status', { name: m.shell_route_loading() }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/my-schedule');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('recovers from a transient crash on Try again, reloading the route data', async () => {
    page.homeCrash = new Error('transient');
    renderRoute({ initialPath: '/', churchTimezone: 'UTC' });
    await screen.findByRole('alert');
    const statusCalls =
      activeChurchApiMock.getActiveChurchStatus.mock.calls.length;

    page.homeCrash = null;
    await userEvent.click(
      screen.getByRole('button', { name: m.shell_error_try_again() }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Home content' }),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(activeChurchApiMock.getActiveChurchStatus).toHaveBeenCalledTimes(
      statusCalls + 1,
    );
  });

  it('navigates home from Go to home', async () => {
    callerCapabilitiesApiMock.getCallerCapabilities.mockResolvedValue(
      callerCapabilitiesFixture({ hasVolunteerMembership: true }),
    );
    page.myScheduleCrash = new Error('boom');
    const { router } = renderRoute({
      initialPath: '/my-schedule',
      churchTimezone: 'UTC',
    });

    await userEvent.click(
      await screen.findByRole('link', { name: m.shell_error_go_home() }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Home content' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/');
  });

  it('takes over the screen when the shell itself cannot resolve, with the same actions', async () => {
    activeChurchApiMock.getActiveChurchStatus.mockRejectedValue(
      new Error('status failed'),
    );
    renderRoute({ initialPath: '/' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(m.shell_error_title());
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: m.shell_error_title() }),
    ).toHaveFocus();
    expect(
      screen.getByRole('link', { name: m.shell_error_go_home() }),
    ).toHaveAttribute('href', '/');

    activeChurchApiMock.getActiveChurchStatus.mockResolvedValue(
      resolvedActiveChurchStatus(),
    );
    await userEvent.click(
      screen.getByRole('button', { name: m.shell_error_try_again() }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Home content' }),
    ).toBeVisible();
    expect(screen.getByRole('navigation')).toBeVisible();
  });

  it('shows the not-found screen with a way home for an unknown URL', async () => {
    renderRoute({ initialPath: '/no-such-page', churchTimezone: 'UTC' });

    expect(
      await screen.findByRole('heading', { name: m.shell_not_found_title() }),
    ).toHaveFocus();
    expect(
      screen.getByRole('link', { name: m.shell_error_go_home() }),
    ).toHaveAttribute('href', '/');
  });

  it('shows error details collapsed in development builds', async () => {
    page.homeCrash = new Error('dev-only message');
    renderRoute({ initialPath: '/', churchTimezone: 'UTC' });

    const summary = await screen.findByText(m.shell_error_details());
    expect(summary.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('dev-only message')).not.toBeVisible();
  });

  it('never shows error details in production builds', async () => {
    vi.stubEnv('DEV', false);
    page.homeCrash = new Error('secret message');
    renderRoute({ initialPath: '/', churchTimezone: 'UTC' });

    await screen.findByRole('alert');
    expect(screen.queryByText(m.shell_error_details())).not.toBeInTheDocument();
    expect(screen.queryByText('secret message')).not.toBeInTheDocument();
  });
});

describe('chunk-load failure after a deploy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    callerCapabilitiesApiMock.getCallerCapabilities.mockReturnValue(
      new Promise(() => {}),
    );
    page.homeCrash = new TypeError(
      'Failed to fetch dynamically imported module: https://church.test/assets/home-abc123.js',
    );
  });

  it('reloads the tab exactly once, then shows the fallback on a repeat', async () => {
    const first = renderRoute({ initialPath: '/', churchTimezone: 'UTC' });
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    first.unmount();

    // The reloaded tab hits the same missing chunk within the guard window.
    renderRoute({ initialPath: '/', churchTimezone: 'UTC' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      m.shell_error_title(),
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows the fallback without reloading for an ordinary crash', async () => {
    page.homeCrash = new Error('boom');
    renderRoute({ initialPath: '/', churchTimezone: 'UTC' });

    await screen.findByRole('alert');
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('crash reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callerCapabilitiesApiMock.getCallerCapabilities.mockReturnValue(
      new Promise(() => {}),
    );
  });

  afterEach(async () => {
    await Sentry.close();
  });

  it('reports the crash through the tunnel and shows its reference code', async () => {
    const tunnel = serveTunnel({ reporting: 'on' });
    await initErrorReporting();
    page.homeCrash = new TypeError('boom');
    renderRoute({ initialPath: '/', churchTimezone: 'UTC' });

    const alert = await screen.findByRole('alert');
    await expect.poll(() => tunnel.items.length).toBe(1);
    const [item] = tunnel.items;
    const traceId = (item?.payload.contexts as { trace: { trace_id: string } })
      .trace.trace_id;
    expect(item?.type).toBe('event');
    expect(item?.payload.tags).toMatchObject({ trace_id: traceId });
    expect(item?.payload.exception).toMatchObject({
      values: [
        {
          type: 'TypeError',
          mechanism: { type: 'crash_fallback', handled: true },
        },
      ],
    });
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(alert).toHaveTextContent(
      m.common_reference_code({ code: traceId.slice(0, 8) }),
    );
  });

  it('shows no reference code while reporting is off', async () => {
    serveTunnel({ reporting: 'off' });
    await initErrorReporting();
    page.homeCrash = new Error('boom');
    renderRoute({ initialPath: '/', churchTimezone: 'UTC' });

    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent(
      m.common_reference_code({ code: '' }).trim(),
    );
  });
});
