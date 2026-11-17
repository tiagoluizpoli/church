import { m } from '@church/i18n/messages';
import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  callerCapabilitiesApiMock,
  callerCapabilitiesFixture,
} from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { mswServer } from '@/tests/setup/msw';
import { renderRoute } from '@/tests/setup/render-route';

const toastError = vi.fn();

// The admin API stays real, so its reads and writes cross MSW like in the app.
vi.mock('@/utils/api-instances', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/api-instances')>()),
  callerCapabilitiesApi: (await import('@/tests/setup/caller-capabilities'))
    .callerCapabilitiesApiMock,
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'u1' }, session: {} } }),
  },
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  },
}));

const API = 'http://localhost:3000/api';
const DIRECTORY = `${API}/v1/ministries/directory`;
const HEALTH = `${API}/health`;

function directoryPage(names: string[]) {
  return {
    ministries: names.map((name) => ({
      id: `m-${name}`,
      churchId: 'church-1',
      name,
      defaultDirection: 'all_out',
      sectorCount: 1,
      roleCount: 1,
      needsReview: false,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    })),
    counts: { total: names.length, review: 0, noSectors: 0 },
  };
}

interface Handlers {
  directory: () => Response;
  health: () => Response;
}

/** Counts directory reads; each handler is swappable mid-test. */
function serve(handlers: Handlers) {
  const calls = { directory: 0 };
  mswServer.use(
    http.get(DIRECTORY, () => {
      calls.directory += 1;
      return handlers.directory();
    }),
    http.get(HEALTH, () => handlers.health()),
  );
  return calls;
}

const ok = (names: string[]) => () => HttpResponse.json(directoryPage(names));
const status = (code: number) => () =>
  HttpResponse.json({ message: 'refused' }, { status: code });
const unreachable = () => HttpResponse.error();
const ready = () =>
  HttpResponse.json({ status: 'ok', database: 'ok', revision: 'r1' });

function renderMinistries() {
  return renderRoute({ initialPath: '/ministries', churchTimezone: 'UTC' });
}

async function listed(name: string) {
  const list = await screen.findByRole('list', { name: m.nav_ministries() });
  return within(list).findByText(name);
}

function banner() {
  return screen.queryAllByText(m.common_reconnecting());
}

/** Window focus: React Query refetches stale reads, the banner probes readiness. */
async function focusWindow() {
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    window.dispatchEvent(new Event('focus'));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  callerCapabilitiesApiMock.getCallerCapabilities.mockResolvedValue(
    callerCapabilitiesFixture({ isChurchAdmin: true }),
  );
});

afterEach(() => {
  focusManager.setFocused(undefined);
});

describe('Reconnecting banner', () => {
  it.each([
    ['a 503', status(503)],
    ['a 502', status(502)],
    ['a 504', status(504)],
    ['no response', unreachable],
  ])('shows one banner for %s on first load, keeps retrying and recovers once readiness answers', async (_label, outage) => {
    const handlers: Handlers = { directory: outage, health: status(503) };
    const calls = serve(handlers);

    renderMinistries();

    expect(await screen.findByRole('status')).toHaveTextContent(
      m.common_reconnecting(),
    );
    expect(banner()).toHaveLength(1);
    await waitFor(() => expect(calls.directory).toBeGreaterThanOrEqual(2), {
      timeout: 3000,
    });
    expect(banner()).toHaveLength(1);
    expect(screen.queryByText(m.ministries_load_failed())).toBeNull();
    expect(toastError).not.toHaveBeenCalled();

    handlers.directory = ok(['Worship']);
    handlers.health = ready;
    await focusWindow();

    expect(await listed('Worship')).toBeVisible();
    await waitFor(() => expect(banner()).toHaveLength(0));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('keeps the data on screen during an outage and refreshes it on recovery', async () => {
    const handlers: Handlers = {
      directory: ok(['Worship']),
      health: status(503),
    };
    serve(handlers);
    renderMinistries();
    expect(await listed('Worship')).toBeVisible();

    handlers.directory = unreachable;
    await focusWindow();

    expect(await screen.findByText(m.common_reconnecting())).toBeVisible();
    expect(await listed('Worship')).toBeVisible();
    expect(toastError).not.toHaveBeenCalled();

    handlers.directory = ok(['Worship', 'Kids']);
    handlers.health = ready;
    await focusWindow();

    expect(await listed('Kids')).toBeVisible();
    await waitFor(() => expect(banner()).toHaveLength(0));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('retries a 500 three times, then shows the page error state and never the banner', async () => {
    const calls = serve({ directory: status(500), health: ready });

    renderMinistries();

    // React Query's default backoff: 1s, 2s and 4s between the four reads.
    expect(
      await screen.findByText(m.ministries_load_failed(), undefined, {
        timeout: 9000,
      }),
    ).toBeVisible();
    expect(calls.directory).toBe(4);
    expect(banner()).toHaveLength(0);
    expect(toastError).toHaveBeenCalledTimes(1);
  }, 12_000);

  it('does not retry a 4xx and shows the in-page message', async () => {
    const calls = serve({ directory: status(403), health: ready });

    renderMinistries();

    expect(await screen.findByText(m.ministries_load_failed())).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(calls.directory).toBe(1);
    expect(banner()).toHaveLength(0);
  });

  it('does not replay a failed save and keeps the typed name', async () => {
    serve({ directory: ok(['Worship']), health: ready });
    let creates = 0;
    mswServer.use(
      http.post(`${API}/v1/ministries/`, () => {
        creates += 1;
        return new HttpResponse(null, { status: 503 });
      }),
    );
    const user = userEvent.setup();
    renderMinistries();

    await user.click(
      await screen.findByRole('button', { name: m.ministries_new() }),
    );
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText(m.ministries_name_label());
    await user.type(input, 'Media');
    await user.click(
      within(dialog).getByRole('button', {
        name: m.ministries_create_submit(),
      }),
    );

    expect(
      await within(dialog).findByText(m.ministries_save_failed()),
    ).toBeVisible();
    expect(input).toHaveValue('Media');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(creates).toBe(1);
  });
});
