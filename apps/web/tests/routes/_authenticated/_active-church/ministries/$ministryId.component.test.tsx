import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetCallerCapabilities200 } from '@/infrastructure/api/churchAPI.schemas';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();
const listMinistries = vi.fn();
const getMinistry = vi.fn();
const listSectors = vi.fn(async () => ({ sectors: [] }));
const renameMinistry = vi.fn();
const archiveMinistry = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    listMinistries: (...args: unknown[]) => listMinistries(...args),
    getMinistry: (...args: unknown[]) => getMinistry(...args),
    listSectors: () => listSectors(),
    renameMinistry: (...args: unknown[]) => renameMinistry(...args),
    archiveMinistry: (...args: unknown[]) => archiveMinistry(...args),
  },
  callerCapabilitiesApi: {
    getCallerCapabilities: (...args: unknown[]) =>
      getCallerCapabilities(...args),
  },
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

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

const MINISTRY_ID = '33333333-3333-4333-8333-333333333331';

function ministry(name: string) {
  return {
    id: MINISTRY_ID,
    churchId: 'church-1',
    name,
    defaultDirection: 'all_out',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
}

function refusal(status: number, data: unknown) {
  return new AxiosError('refused', String(status), undefined, undefined, {
    status,
    data,
  } as AxiosResponse);
}

function signInAs(capabilities: GetCallerCapabilities200) {
  getCallerCapabilities.mockResolvedValue(capabilities);
}

const asAdmin = () =>
  signInAs(callerCapabilitiesFixture({ isChurchAdmin: true }));
const asLeader = () =>
  signInAs(callerCapabilitiesFixture({ ledMinistries: 1 }));

beforeEach(() => {
  vi.clearAllMocks();
  getMinistry.mockResolvedValue(ministry('Worship'));
  listMinistries.mockResolvedValue({ ministries: [ministry('Worship')] });
});

function renderWorkspace(tab = '') {
  return renderRoute({
    initialPath: `/ministries/${MINISTRY_ID}${tab}`,
    churchTimezone: 'UTC',
  });
}

async function tabNames() {
  const nav = await screen.findByRole('navigation', {
    name: m.ministry_tabs_label(),
  });
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent);
}

describe('/ministries/$ministryId workspace', () => {
  it('redirects the Ministry root to its Sectors tab', async () => {
    asAdmin();

    const { router } = renderWorkspace();

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/ministries/${MINISTRY_ID}/sectors`,
      ),
    );
    expect(
      await screen.findByRole('heading', { name: 'Worship' }),
    ).toBeVisible();
  });

  it('shows the four routed tabs in order to a ChurchAdmin', async () => {
    asAdmin();

    renderWorkspace('/sectors');

    expect(await tabNames()).toEqual([
      m.ministry_tab_sectors(),
      m.ministry_tab_roles(),
      m.ministry_tab_usual_setup(),
      m.ministry_tab_settings(),
    ]);
    expect(
      screen.getByRole('link', { name: m.ministry_tab_sectors() }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('hides Settings from a leader and refuses its direct URL', async () => {
    asLeader();

    renderWorkspace('/settings');

    expect(await screen.findByText(m.shell_no_access())).toBeVisible();
    expect(await tabNames()).not.toContain(m.ministry_tab_settings());
    expect(
      screen.queryByLabelText(m.ministries_name_label()),
    ).not.toBeInTheDocument();
  });

  it('keeps the translated Usual setup placeholder', async () => {
    asLeader();

    renderWorkspace('/usual-setup');

    expect(
      await screen.findByRole('heading', {
        name: m.ministry_tab_usual_setup(),
      }),
    ).toBeVisible();
    expect(screen.getByText(m.shell_coming_soon())).toBeVisible();
  });

  it('renders the not-found state for a 404 without tabs', async () => {
    asAdmin();
    getMinistry.mockRejectedValue(
      refusal(404, { error: 'NOT_FOUND', message: m.error_not_found() }),
    );

    renderWorkspace('/sectors');

    expect(await screen.findByText(m.ministry_not_found())).toBeVisible();
    expect(
      screen.queryByRole('navigation', { name: m.ministry_tabs_label() }),
    ).not.toBeInTheDocument();
  });

  it('renders the no-access state for a 403', async () => {
    asLeader();
    getMinistry.mockRejectedValue(
      refusal(403, { error: 'FORBIDDEN', message: m.error_forbidden() }),
    );

    renderWorkspace('/sectors');

    expect(await screen.findByText(m.shell_no_access())).toBeVisible();
  });
});

describe('Ministry Settings', () => {
  it('renames the Ministry and refreshes its name and the Ministry lists', async () => {
    asAdmin();
    renameMinistry.mockResolvedValue(ministry('Praise'));
    const user = userEvent.setup();
    renderWorkspace('/settings');

    const input = await screen.findByLabelText(m.ministries_name_label());
    expect(input).toHaveValue('Worship');
    const listReadsBefore = listMinistries.mock.calls.length;
    getMinistry.mockResolvedValue(ministry('Praise'));
    await user.clear(input);
    await user.type(input, ' Praise ');
    await user.click(
      screen.getByRole('button', { name: m.ministry_settings_save() }),
    );

    expect(renameMinistry).toHaveBeenCalledWith(MINISTRY_ID, {
      name: 'Praise',
    });
    expect(
      await screen.findByRole('heading', { name: 'Praise' }),
    ).toBeVisible();
    await waitFor(() =>
      expect(listMinistries.mock.calls.length).toBeGreaterThan(listReadsBefore),
    );
  });

  it('shows a name conflict inline and keeps the typed name', async () => {
    asAdmin();
    renameMinistry.mockRejectedValue(
      refusal(409, {
        error: 'MINISTRY_NAME_IN_USE',
        message: m.error_ministry_name_in_use(),
      }),
    );
    const user = userEvent.setup();
    renderWorkspace('/settings');

    const input = await screen.findByLabelText(m.ministries_name_label());
    await user.clear(input);
    await user.type(input, 'Kids');
    await user.click(
      screen.getByRole('button', { name: m.ministry_settings_save() }),
    );

    expect(
      await screen.findByText(m.error_ministry_name_in_use()),
    ).toBeVisible();
    expect(input).toHaveValue('Kids');
    expect(screen.getByRole('heading', { name: 'Worship' })).toBeVisible();
  });
});

describe('Ministry archive', () => {
  const CYCLE_ID = '44444444-4444-4444-8444-444444444441';

  async function confirmArchive() {
    const user = userEvent.setup();
    renderWorkspace('/settings');
    await user.click(
      await screen.findByRole('button', { name: m.ministry_archive_open() }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(m.ministry_archive_description()),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole('button', {
        name: m.ministry_archive_confirm(),
      }),
    );
  }

  it('confirms, archives and returns to the refreshed Ministries list and capabilities', async () => {
    asAdmin();
    archiveMinistry.mockResolvedValue(undefined);
    const { router } = renderWorkspace('/settings');
    await screen.findByLabelText(m.ministries_name_label());
    const capabilityReads = getCallerCapabilities.mock.calls.length;
    listMinistries.mockResolvedValue({ ministries: [] });
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: m.ministry_archive_open() }),
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: m.ministry_archive_confirm(),
      }),
    );

    expect(archiveMinistry).toHaveBeenCalledWith(MINISTRY_ID);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/ministries'),
    );
    await waitFor(() =>
      expect(getCallerCapabilities.mock.calls.length).toBeGreaterThan(
        capabilityReads,
      ),
    );
  });

  it('archives nothing when the confirmation is cancelled', async () => {
    asAdmin();
    const user = userEvent.setup();
    renderWorkspace('/settings');

    await user.click(
      await screen.findByRole('button', { name: m.ministry_archive_open() }),
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: m.ministries_cancel(),
      }),
    );

    expect(archiveMinistry).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('lists blocking Cycles as new-tab links to their Schedules and stays on Settings', async () => {
    asAdmin();
    archiveMinistry.mockRejectedValue(
      refusal(409, {
        error: 'MINISTRY_IN_USE',
        message: 'localized',
        blockers: [
          {
            kind: 'cycle',
            ministryId: MINISTRY_ID,
            ministryName: 'Worship',
            cycleId: CYCLE_ID,
            cycleName: 'June',
          },
        ],
      }),
    );

    await confirmArchive();

    expect(await screen.findByText(m.error_ministry_in_use())).toBeVisible();
    const link = screen.getByRole('link', { name: 'June' });
    expect(link).toHaveAttribute(
      'href',
      `/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(screen.getByLabelText(m.ministries_name_label())).toBeVisible();
  });

  it('shows a retryable failure for any other refusal', async () => {
    asAdmin();
    archiveMinistry.mockRejectedValue(refusal(500, {}));

    await confirmArchive();

    expect(await screen.findByText(m.ministry_archive_failed())).toBeVisible();
  });

  it('ships the archive text in English too', () => {
    expect(m.ministry_archive_open({}, { locale: 'en' })).toBe(
      'Archive Ministry',
    );
    expect(m.ministry_archive_open()).not.toBe(
      m.ministry_archive_open({}, { locale: 'en' }),
    );
  });
});
