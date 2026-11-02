import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FLAGGED_SERVICE,
  MINISTRY_ID,
  NIGHT,
  NIGHT_ID,
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
import { fillTimeOfDayField } from '@/tests/setup/time-of-day';

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

function cell(sector: string, shift: string = WHOLE()) {
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
  it('shows the saved values of a block needing review, explains the fallback, and repairs explicitly', async () => {
    const user = userEvent.setup();
    listUsualSetup.mockResolvedValue(setupOf(FLAGGED_SERVICE));
    saveUsualSetupBlock.mockResolvedValue({
      ...FLAGGED_SERVICE,
      needsReview: false,
    });
    await openForm(SERVICE_ID);

    expect(screen.getByText(m.usual_setup_needs_review() + '.')).toBeVisible();
    expect(
      screen.getByText(m.usual_setup_needs_review() + '.').parentElement,
    ).toHaveTextContent(m.usual_setup_review_fallback());
    expect(
      within(screen.getByTestId('shift-split-end-2'))
        .getAllByRole('spinbutton')
        .map((segment) => segment.textContent),
    ).toEqual(['12', '00']);
    expect(saveButton()).toBeDisabled();
    expect(saveUsualSetupBlock).not.toHaveBeenCalled();

    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('shift-split-end-2'),
      time: '11:30',
    });
    await user.type(
      cell('Door', `${m.usual_setup_shift_label({ number: 2 })} · 11:00–11:30`),
      '3',
    );
    await user.click(saveButton());

    expect(saveUsualSetupBlock).toHaveBeenCalledWith(
      MINISTRY_ID,
      SERVICE_ID,
      expect.objectContaining({
        shiftSplit: {
          kind: 'manual',
          spans: [
            { startTime: '10:00', endTime: '11:00' },
            { startTime: '11:00', endTime: '11:30' },
          ],
        },
      }),
    );
  });

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
      screen.getByRole('radio', { name: m.shift_split_mode_equal() }),
    ).toBeChecked();
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

describe('Shift split editing', () => {
  const mode = (name: () => string) =>
    screen.getByRole('radio', { name: name() });
  const shiftLabel = (number: number) => m.usual_setup_shift_label({ number });
  const stage = {
    shiftIndex: 0,
    sectorId: 'sector-stage',
    roleId: 'role-singer',
  };

  async function chooseEqual(
    user: ReturnType<typeof userEvent.setup>,
    count: string,
  ) {
    await user.click(mode(m.shift_split_mode_equal));
    const field = screen.getByLabelText(m.shift_split_equal_count());
    await user.clear(field);
    await user.type(field, count);
  }

  it('saves N equal Shifts with independent counts per Shift', async () => {
    const user = userEvent.setup();
    saveUsualSetupBlock.mockResolvedValue(WELCOME);
    await openForm(WELCOME_ID);
    await user.click(serves());

    await chooseEqual(user, '3');
    await user.type(cell('Stage', shiftLabel(1)), '2');
    await user.type(cell('Stage', shiftLabel(3)), '4');
    await user.type(cell('Door', shiftLabel(2)), '1');

    expect(cell('Stage', shiftLabel(2))).toHaveValue(null);
    await user.click(saveButton());
    expect(saveUsualSetupBlock).toHaveBeenCalledWith(MINISTRY_ID, WELCOME_ID, {
      serves: true,
      shiftSplit: { kind: 'equal', count: 3 },
      headcounts: [
        { ...stage, shiftIndex: 0, peopleNeeded: 2 },
        { ...stage, shiftIndex: 1, sectorId: 'sector-door', peopleNeeded: 1 },
        { ...stage, shiftIndex: 2, peopleNeeded: 4 },
      ],
    });
  });

  it('never copies counts to new Shifts, and keeps them for an unchanged Shift identity', async () => {
    const user = userEvent.setup();
    await openForm(SERVICE_ID);

    await chooseEqual(user, '2');
    expect(cell('Stage', shiftLabel(1))).toHaveValue(null);
    expect(screen.getAllByText(m.headcount_grid_empty_shift())).toHaveLength(2);

    await user.click(mode(m.shift_split_mode_whole));
    expect(cell('Stage')).toHaveValue(2);
    expect(cell('Door')).toHaveValue(1);
  });

  it('blocks Save on an invalid equal count and keeps the typed text', async () => {
    const user = userEvent.setup();
    await openForm(SERVICE_ID);

    await chooseEqual(user, '0');

    expect(saveButton()).toBeDisabled();
    expect(screen.getByLabelText(m.shift_split_equal_count())).toHaveValue(0);
    expect(
      screen.getByText(m.shift_split_count_invalid({ max: 50 })),
    ).toBeVisible();
    expect(screen.getByText(m.shift_split_fix_times())).toBeVisible();

    await user.clear(screen.getByLabelText(m.shift_split_equal_count()));
    await user.type(screen.getByLabelText(m.shift_split_equal_count()), '2');
    expect(saveButton()).toBeDisabled(); // both new Shifts are still empty
    await user.type(cell('Stage', shiftLabel(2)), '1');
    expect(saveButton()).toBeEnabled();
  });

  it('saves manual Shifts ordered inside the block, each with its own counts', async () => {
    const user = userEvent.setup();
    saveUsualSetupBlock.mockResolvedValue(SERVICE);
    await openForm(SERVICE_ID);

    await user.click(mode(m.shift_split_mode_manual));
    // The span covering the block is the whole-block Shift: counts stay.
    expect(cell('Stage', `${shiftLabel(1)} · 10:00–12:00`)).toHaveValue(2);
    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('shift-split-end-1'),
      time: '11:00',
    });
    await user.click(screen.getByRole('button', { name: m.shift_split_add() }));
    await user.type(cell('Stage', `${shiftLabel(1)} · 10:00–11:00`), '2');
    await user.type(cell('Door', `${shiftLabel(2)} · 11:00–12:00`), '3');

    await user.click(saveButton());

    expect(saveUsualSetupBlock).toHaveBeenCalledWith(MINISTRY_ID, SERVICE_ID, {
      serves: true,
      shiftSplit: {
        kind: 'manual',
        spans: [
          { startTime: '10:00', endTime: '11:00' },
          { startTime: '11:00', endTime: '12:00' },
        ],
      },
      headcounts: [
        { ...stage, peopleNeeded: 2 },
        { ...stage, shiftIndex: 1, sectorId: 'sector-door', peopleNeeded: 3 },
      ],
    });
  });

  it('refuses spans outside the block or overlapping, preserving the draft', async () => {
    const user = userEvent.setup();
    await openForm(SERVICE_ID);
    await user.click(mode(m.shift_split_mode_manual));

    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('shift-split-end-1'),
      time: '13:00',
    });

    expect(saveButton()).toBeDisabled();
    expect(
      screen.getByText(
        m.shift_split_span_outside_block({ range: '10:00–12:00' }),
      ),
    ).toBeVisible();
    expect(screen.getByText(m.shift_split_fix_times())).toBeVisible();

    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('shift-split-end-1'),
      time: '11:00',
    });
    await user.click(screen.getByRole('button', { name: m.shift_split_add() }));
    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('shift-split-start-2'),
      time: '10:30',
    });
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(m.shift_split_span_overlap())).toBeVisible();

    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('shift-split-start-2'),
      time: '11:00',
    });
    await user.type(cell('Stage', `${shiftLabel(1)} · 10:00–11:00`), '2');
    expect(saveButton()).toBeEnabled();
  });

  it('describes and accepts an overnight Shift on an overnight block', async () => {
    const user = userEvent.setup();
    saveUsualSetupBlock.mockResolvedValue(NIGHT);
    await openForm(NIGHT_ID);
    await user.click(serves());
    await user.click(mode(m.shift_split_mode_manual));

    expect(
      screen.getByText(
        m.span_runs_next_day({ duration: m.span_duration_hours({ hours: 4 }) }),
      ),
    ).toBeVisible();
    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('shift-split-end-1'),
      time: '00:00',
    });
    await user.click(screen.getByRole('button', { name: m.shift_split_add() }));
    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('shift-split-end-2'),
      time: '02:00',
    });
    await user.type(cell('Stage', `${shiftLabel(2)} · 00:00–02:00`), '2');
    await user.click(saveButton());

    expect(saveUsualSetupBlock).toHaveBeenCalledWith(MINISTRY_ID, NIGHT_ID, {
      serves: true,
      shiftSplit: {
        kind: 'manual',
        spans: [
          { startTime: '22:00', endTime: '00:00' },
          { startTime: '00:00', endTime: '02:00' },
        ],
      },
      headcounts: [{ ...stage, shiftIndex: 1, peopleNeeded: 2 }],
    });
  });

  it('keeps the whole draft when the API refuses the split', async () => {
    const user = userEvent.setup();
    saveUsualSetupBlock.mockRejectedValueOnce(
      refusal(400, {
        error: 'INVALID_SHIFT_SPLIT',
        message: m.error_invalid_shift_split(),
      }),
    );
    await openForm(SERVICE_ID);

    await chooseEqual(user, '2');
    await user.type(cell('Stage', shiftLabel(1)), '3');
    await user.click(saveButton());

    expect(
      await screen.findByText(m.error_invalid_shift_split()),
    ).toBeVisible();
    expect(cell('Stage', shiftLabel(1))).toHaveValue(3);
  });
});
