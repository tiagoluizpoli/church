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
const listSectors = vi.fn();
const createSector = vi.fn();
const renameSector = vi.fn();
const archiveSector = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    listMinistries: (...args: unknown[]) => listMinistries(...args),
    getMinistry: (...args: unknown[]) => getMinistry(...args),
    listSectors: (...args: unknown[]) => listSectors(...args),
    createSector: (...args: unknown[]) => createSector(...args),
    renameSector: (...args: unknown[]) => renameSector(...args),
    archiveSector: (...args: unknown[]) => archiveSector(...args),
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
const CYCLE_ID = '44444444-4444-4444-8444-444444444441';
const STAGE = { id: 'sector-stage', name: 'stage' };
const BABIES = { id: 'sector-babies', name: 'Babies Room' };

function refusal(status: number, data: unknown) {
  return new AxiosError('refused', String(status), undefined, undefined, {
    status,
    data,
  } as AxiosResponse);
}

function signInAs(capabilities: GetCallerCapabilities200) {
  getCallerCapabilities.mockResolvedValue(capabilities);
}

beforeEach(() => {
  vi.clearAllMocks();
  const worship = {
    id: MINISTRY_ID,
    churchId: 'church-1',
    name: 'Worship',
    defaultDirection: 'all_out',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
  getMinistry.mockResolvedValue(worship);
  listMinistries.mockResolvedValue({ ministries: [worship] });
  listSectors.mockResolvedValue({ sectors: [BABIES, STAGE] });
  signInAs(callerCapabilitiesFixture({ isChurchAdmin: true }));
});

function renderSectors() {
  return renderRoute({
    initialPath: `/ministries/${MINISTRY_ID}/sectors`,
    churchTimezone: 'UTC',
  });
}

async function rowNames() {
  const list = await screen.findByRole('list', {
    name: m.ministry_tab_sectors(),
  });
  return within(list)
    .getAllByRole('listitem')
    .map((item) => within(item).getByTestId('sector-name').textContent);
}

describe('/ministries/$ministryId/sectors', () => {
  it.each([
    ['a ChurchAdmin', callerCapabilitiesFixture({ isChurchAdmin: true })],
    ['the Ministry leader', callerCapabilitiesFixture({ ledMinistries: 1 })],
  ])('lists Sectors in the server alphabetical order for %s', async (_persona, capabilities) => {
    signInAs(capabilities);

    renderSectors();

    expect(await rowNames()).toEqual(['Babies Room', 'stage']);
    expect(listSectors).toHaveBeenCalledWith(MINISTRY_ID);
  });

  it('shows the setup instruction when the Ministry has no Sectors', async () => {
    listSectors.mockResolvedValue({ sectors: [] });

    renderSectors();

    expect(await screen.findByText(m.ministry_sectors_empty())).toBeVisible();
  });

  it('adds a name-only Sector and refreshes the list', async () => {
    const user = userEvent.setup();
    createSector.mockResolvedValue({ id: 'sector-door', name: 'Main Door' });
    renderSectors();
    await rowNames();
    listSectors.mockResolvedValue({
      sectors: [BABIES, { id: 'sector-door', name: 'Main Door' }, STAGE],
    });

    await user.click(screen.getByRole('button', { name: m.sectors_add() }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(m.ministries_name_label()),
      '  Main Door ',
    );
    await user.click(
      within(dialog).getByRole('button', { name: m.sectors_add_submit() }),
    );

    expect(createSector).toHaveBeenCalledWith(MINISTRY_ID, {
      name: 'Main Door',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await rowNames()).toEqual(['Babies Room', 'Main Door', 'stage']);
  });

  it('shows a duplicate inline and keeps the typed name', async () => {
    const user = userEvent.setup();
    createSector.mockRejectedValue(
      refusal(409, { error: 'SECTOR_NAME_IN_USE', message: 'x' }),
    );
    renderSectors();

    await user.click(
      await screen.findByRole('button', { name: m.sectors_add() }),
    );
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText(m.ministries_name_label());
    await user.type(input, 'BABIES ROOM');
    await user.click(
      within(dialog).getByRole('button', { name: m.sectors_add_submit() }),
    );

    expect(
      await within(dialog).findByText(m.error_sector_name_in_use()),
    ).toBeVisible();
    expect(input).toHaveValue('BABIES ROOM');
  });

  it('warns that history shows a new name and renames the same Sector', async () => {
    const user = userEvent.setup();
    renameSector.mockResolvedValue({ id: STAGE.id, name: 'Platform' });
    renderSectors();

    await user.click(
      await screen.findByRole('button', {
        name: m.sectors_rename_label({ name: 'stage' }),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(m.sectors_rename_warning_title()),
    ).toBeVisible();
    expect(within(dialog).getByText(m.sectors_rename_warning())).toBeVisible();
    const input = within(dialog).getByLabelText(m.ministries_name_label());
    await user.clear(input);
    await user.type(input, 'Platform');
    await user.click(
      within(dialog).getByRole('button', { name: m.sectors_rename_submit() }),
    );

    expect(renameSector).toHaveBeenCalledWith(MINISTRY_ID, STAGE.id, {
      name: 'Platform',
    });
  });

  it('archives a Sector after confirmation', async () => {
    const user = userEvent.setup();
    archiveSector.mockResolvedValue(undefined);
    renderSectors();

    await user.click(
      await screen.findByRole('button', {
        name: m.sectors_archive_label({ name: 'stage' }),
      }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(m.sectors_archive_title({ name: 'stage' })),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole('button', { name: m.sectors_archive_confirm() }),
    );

    expect(archiveSector).toHaveBeenCalledWith(MINISTRY_ID, STAGE.id);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('shows blocker locations as new-tab links and leaves the Sector in place', async () => {
    const user = userEvent.setup();
    archiveSector.mockRejectedValue(
      refusal(409, {
        error: 'SECTOR_IN_USE',
        message: m.error_sector_in_use(),
        blockers: [
          {
            kind: 'requirement',
            ministryId: MINISTRY_ID,
            ministryName: 'Worship',
            cycleId: CYCLE_ID,
            cycleName: 'June',
            eventId: 'event-1',
            eventTimeBlockId: 'block-1',
          },
          {
            kind: 'usual_setup',
            ministryId: MINISTRY_ID,
            ministryName: 'Worship',
            templateTimeBlockId: 'template-block-1',
          },
        ],
      }),
    );
    renderSectors();

    await user.click(
      await screen.findByRole('button', {
        name: m.sectors_archive_label({ name: 'stage' }),
      }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      within(dialog).getByRole('button', { name: m.sectors_archive_confirm() }),
    );

    expect(
      await within(dialog).findByText(m.error_sector_in_use()),
    ).toBeVisible();
    const requirement = within(dialog).getByRole('link', {
      name: new RegExp(
        m.ministry_blocker_requirement({
          ministryName: 'Worship',
          cycleName: 'June',
        }),
      ),
    });
    expect(requirement).toHaveAttribute(
      'href',
      `/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    );
    expect(requirement).toHaveAttribute('target', '_blank');
    const usualSetup = within(dialog).getByRole('link', {
      name: new RegExp(
        m.ministry_blocker_usual_setup({ ministryName: 'Worship' }),
      ),
    });
    expect(usualSetup).toHaveAttribute(
      'href',
      `/ministries/${MINISTRY_ID}/usual-setup`,
    );
    expect(usualSetup).toHaveAttribute('target', '_blank');
    expect(
      within(dialog).queryByRole('button', {
        name: m.sectors_archive_confirm(),
      }),
    ).toBeNull();
  });

  it('archives and then opens Add for the alternative', async () => {
    const user = userEvent.setup();
    archiveSector.mockResolvedValue(undefined);
    renderSectors();

    await user.click(
      await screen.findByRole('button', {
        name: m.sectors_rename_label({ name: 'stage' }),
      }),
    );
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: m.sectors_archive_instead(),
      }),
    );
    const confirm = await screen.findByRole('alertdialog');
    expect(archiveSector).not.toHaveBeenCalled();
    await user.click(
      within(confirm).getByRole('button', {
        name: m.sectors_archive_and_create_confirm(),
      }),
    );

    expect(archiveSector).toHaveBeenCalledWith(MINISTRY_ID, STAGE.id);
    const add = await screen.findByRole('dialog');
    expect(
      within(add).getByRole('heading', { name: m.sectors_add() }),
    ).toBeVisible();
    expect(createSector).not.toHaveBeenCalled();
  });

  it('opens no Add when the alternative is blocked or cancelled', async () => {
    const user = userEvent.setup();
    archiveSector.mockRejectedValue(
      refusal(409, { error: 'SECTOR_IN_USE', message: 'in use', blockers: [] }),
    );
    renderSectors();

    for (const outcome of ['blocked', 'cancelled'] as const) {
      await user.click(
        await screen.findByRole('button', {
          name: m.sectors_rename_label({ name: 'stage' }),
        }),
      );
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: m.sectors_archive_instead(),
        }),
      );
      const confirm = await screen.findByRole('alertdialog');
      if (outcome === 'blocked') {
        await user.click(
          within(confirm).getByRole('button', {
            name: m.sectors_archive_and_create_confirm(),
          }),
        );
        await within(confirm).findByText('in use');
        await user.click(
          within(confirm).getByRole('button', { name: m.sectors_close() }),
        );
      } else {
        await user.click(
          within(confirm).getByRole('button', { name: m.ministries_cancel() }),
        );
      }
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(screen.queryByRole('dialog')).toBeNull();
    }
    expect(archiveSector).toHaveBeenCalledTimes(1);
    expect(createSector).not.toHaveBeenCalled();
  });
});
