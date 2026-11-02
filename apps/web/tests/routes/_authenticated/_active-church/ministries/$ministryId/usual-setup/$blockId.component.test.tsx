import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MINISTRY_ID,
  NIGHT,
  ROLES,
  SECTORS,
  SERVICE,
  SERVICE_ID,
  setupOf,
  WELCOME,
  WELCOME_ID,
  WORSHIP,
} from './usual-setup.fixtures';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();
const listUsualSetup = vi.fn();
const listSectors = vi.fn();
const listMinistryRoles = vi.fn();
const saveUsualSetupBlock = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    listMinistries: async () => ({ ministries: [WORSHIP] }),
    getMinistry: async () => WORSHIP,
    listSectors: (...args: unknown[]) => listSectors(...args),
    listMinistryRoles: (...args: unknown[]) => listMinistryRoles(...args),
    listUsualSetup: (...args: unknown[]) => listUsualSetup(...args),
    saveUsualSetupBlock: (...args: unknown[]) => saveUsualSetupBlock(...args),
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

beforeEach(() => {
  vi.clearAllMocks();
  listUsualSetup.mockResolvedValue(setupOf(WELCOME, SERVICE, NIGHT));
  listSectors.mockResolvedValue({ sectors: SECTORS });
  listMinistryRoles.mockResolvedValue({ roles: ROLES });
  getCallerCapabilities.mockResolvedValue(
    callerCapabilitiesFixture({ ledMinistries: 1 }),
  );
});

function renderEditor(blockId: string) {
  return renderRoute({
    initialPath: `/ministries/${MINISTRY_ID}/usual-setup/${blockId}`,
    churchTimezone: 'UTC',
  });
}

const WHOLE = () => m.usual_setup_whole_block_shift();

function cell(sector: string, shift = WHOLE()) {
  return screen.getByRole('spinbutton', {
    name: m.headcount_grid_cell_label({ role: 'Singer', sector, shift }),
  });
}

function serves() {
  return screen.getByRole('checkbox', { name: m.usual_setup_serves_label() });
}

function saveButton() {
  return screen.getByRole('button', { name: m.usual_setup_save() });
}

async function openForm(blockId: string) {
  const rendered = renderEditor(blockId);
  await screen.findByRole('checkbox', { name: m.usual_setup_serves_label() });
  return rendered;
}

function refusal(status: number, data: unknown) {
  return new AxiosError('refused', String(status), undefined, undefined, {
    status,
    data,
  } as AxiosResponse);
}

describe('/ministries/$ministryId/usual-setup/$blockId', () => {
  it('starts a new block as Not served and saves an explicit opt-out', async () => {
    const user = userEvent.setup();
    saveUsualSetupBlock.mockResolvedValue(WELCOME);
    await openForm(WELCOME_ID);

    expect(
      screen.getByRole('heading', { name: 'Sunday · Welcome' }),
    ).toBeVisible();
    expect(serves()).not.toBeChecked();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    await user.click(saveButton());

    expect(saveUsualSetupBlock).toHaveBeenCalledWith(MINISTRY_ID, WELCOME_ID, {
      serves: false,
      shiftSplit: { kind: 'equal', count: 1 },
      headcounts: [],
    });
  });

  it('saves only positive counts, omitting blank and zero, then returns to a fresh summary', async () => {
    const user = userEvent.setup();
    const saved = {
      ...WELCOME,
      entry: {
        serves: true,
        shiftSplit: { kind: 'equal' as const, count: 1 },
        headcounts: [
          {
            shiftIndex: 0,
            sectorId: 'sector-stage',
            roleId: 'role-singer',
            peopleNeeded: 2,
          },
        ],
      },
    };
    saveUsualSetupBlock.mockResolvedValue(saved);
    await openForm(WELCOME_ID);

    await user.click(serves());
    await user.type(cell('Stage'), '2');
    await user.type(cell('Door'), '0');
    listUsualSetup.mockResolvedValue(setupOf(saved, SERVICE, NIGHT));
    await user.click(saveButton());

    expect(saveUsualSetupBlock).toHaveBeenCalledWith(MINISTRY_ID, WELCOME_ID, {
      serves: true,
      shiftSplit: { kind: 'equal', count: 1 },
      headcounts: [
        {
          shiftIndex: 0,
          sectorId: 'sector-stage',
          roleId: 'role-singer',
          peopleNeeded: 2,
        },
      ],
    });
    const sunday = await screen.findByRole('list', { name: 'Sunday' });
    expect(
      within(sunday).getByRole('link', { name: /Welcome/ }),
    ).toHaveTextContent(m.usual_setup_people_count_other({ count: 2 }));
  });

  it('refuses to save a serving block without people or with an invalid count', async () => {
    const user = userEvent.setup();
    await openForm(WELCOME_ID);

    await user.click(serves());
    expect(saveButton()).toBeDisabled();
    expect(
      screen.getByText(m.error_validation_usual_setup_empty()),
    ).toBeVisible();

    await user.type(cell('Stage'), '1.5');
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(m.usual_setup_fix_invalid())).toBeVisible();
    expect(cell('Stage')).toHaveValue(1.5);
  });

  it('keeps the draft after a failed save and saves on retry', async () => {
    const user = userEvent.setup();
    saveUsualSetupBlock
      .mockRejectedValueOnce(
        refusal(404, {
          error: 'NOT_FOUND',
          message: m.error_not_found(),
        }),
      )
      .mockResolvedValueOnce(SERVICE);
    await openForm(SERVICE_ID);

    await user.clear(cell('Stage'));
    await user.type(cell('Stage'), '4');
    await user.click(saveButton());

    expect(await screen.findByText(m.error_not_found())).toBeVisible();
    expect(cell('Stage')).toHaveValue(4);
    expect(cell('Door')).toHaveValue(1);
    await user.click(saveButton());
    expect(await screen.findByRole('list', { name: 'Sunday' })).toBeVisible();
    expect(saveUsualSetupBlock).toHaveBeenCalledTimes(2);
  });

  it('protects a pending save from a second submit', async () => {
    const user = userEvent.setup();
    saveUsualSetupBlock.mockReturnValue(new Promise(() => {}));
    await openForm(SERVICE_ID);

    await user.click(saveButton());

    const pending = await screen.findByRole('button', {
      name: m.usual_setup_saving(),
    });
    expect(pending).toBeDisabled();
    expect(
      screen.getByRole('button', { name: m.usual_setup_cancel() }),
    ).toBeDisabled();
  });

  it('cancels back to the list without writing', async () => {
    const user = userEvent.setup();
    await openForm(SERVICE_ID);

    await user.type(cell('Stage'), '9');
    await user.click(
      screen.getByRole('button', { name: m.usual_setup_cancel() }),
    );

    expect(await screen.findByRole('list', { name: 'Sunday' })).toBeVisible();
    expect(saveUsualSetupBlock).not.toHaveBeenCalled();
  });

  it('keeps an open draft when the reads refetch', async () => {
    const user = userEvent.setup();
    const { queryClient } = await openForm(SERVICE_ID);

    await user.clear(cell('Stage'));
    await user.type(cell('Stage'), '7');
    listSectors.mockResolvedValue({
      sectors: [...SECTORS, { id: 'sector-lobby', name: 'Lobby' }],
    });
    await queryClient.refetchQueries();

    await waitFor(() => expect(cell('Lobby')).toBeVisible());
    expect(cell('Stage')).toHaveValue(7);
  });

  it('keeps an existing multi-Shift setup with its own counts per Shift', async () => {
    const user = userEvent.setup();
    const twoShifts = {
      ...SERVICE,
      entry: {
        serves: true,
        shiftSplit: { kind: 'equal' as const, count: 2 },
        headcounts: [
          {
            shiftIndex: 0,
            sectorId: 'sector-stage',
            roleId: 'role-singer',
            peopleNeeded: 2,
          },
          {
            shiftIndex: 1,
            sectorId: 'sector-stage',
            roleId: 'role-singer',
            peopleNeeded: 5,
          },
        ],
      },
    };
    listUsualSetup.mockResolvedValue(setupOf(twoShifts));
    saveUsualSetupBlock.mockResolvedValue(twoShifts);
    await openForm(SERVICE_ID);

    const first = m.usual_setup_shift_label({ number: 1 });
    const second = m.usual_setup_shift_label({ number: 2 });
    expect(
      screen.getByText(m.usual_setup_split_kept({ count: 2 })),
    ).toBeVisible();
    expect(cell('Stage', first)).toHaveValue(2);
    expect(cell('Stage', second)).toHaveValue(5);
    await user.type(cell('Door', second), '1');
    await user.click(saveButton());

    expect(saveUsualSetupBlock).toHaveBeenCalledWith(MINISTRY_ID, SERVICE_ID, {
      serves: true,
      shiftSplit: { kind: 'equal', count: 2 },
      headcounts: [
        {
          shiftIndex: 0,
          sectorId: 'sector-stage',
          roleId: 'role-singer',
          peopleNeeded: 2,
        },
        {
          shiftIndex: 1,
          sectorId: 'sector-stage',
          roleId: 'role-singer',
          peopleNeeded: 5,
        },
        {
          shiftIndex: 1,
          sectorId: 'sector-door',
          roleId: 'role-singer',
          peopleNeeded: 1,
        },
      ],
    });
  });

  it('links to missing Sectors and Roles in a new tab', async () => {
    const user = userEvent.setup();
    listSectors.mockResolvedValue({ sectors: [] });
    listMinistryRoles.mockResolvedValue({ roles: [] });
    await openForm(WELCOME_ID);

    await user.click(serves());

    expect(screen.getByText(m.usual_setup_missing_sectors())).toBeVisible();
    for (const [name, href] of [
      [m.prepare_set_up_sectors(), `/ministries/${MINISTRY_ID}/sectors`],
      [m.usual_setup_set_up_roles(), `/ministries/${MINISTRY_ID}/roles`],
    ]) {
      const link = screen.getByRole('link', { name: new RegExp(name) });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveTextContent(m.sectors_opens_new_tab());
    }
    expect(saveButton()).toBeDisabled();
  });

  it('says a removed block no longer exists', async () => {
    await renderEditor('55555555-5555-4555-8555-555555555599');

    expect(
      await screen.findByText(m.usual_setup_block_not_found()),
    ).toBeVisible();
  });

  it('shows a retryable error rather than an empty form when a read fails', async () => {
    listSectors.mockRejectedValueOnce(new Error('offline'));
    renderEditor(WELCOME_ID);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(m.usual_setup_load_failed())).toBeVisible();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
