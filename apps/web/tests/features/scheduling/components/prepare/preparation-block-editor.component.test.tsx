import { m } from '@church/i18n/messages';
import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BLOCK,
  BLOCK_ID,
  CYCLE_ID,
  EDITOR_PATH,
  EVENT,
  MINISTRY_ID,
  PARTICIPATION_ID,
  REQUIREMENT,
  ROLES,
  SCHEDULE,
  SECTORS,
  SHIFT,
  SHIFT_ID,
} from './preparation-block.fixtures';
import type { PreparationBlock } from '@/features/scheduling/components/prepare/preparation-block.utils';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';
import { fillTimeOfDayField } from '@/tests/setup/time-of-day';

const api = vi.hoisted(() => ({
  getCycleParticipation: vi.fn(),
  listSchedules: vi.fn(),
  listSectors: vi.fn(),
  listMinistryRoles: vi.fn(),
  saveEventTimeBlockPreparation: vi.fn(),
}));
vi.mock('@/utils/api-instances', async () => ({
  adminApi: {
    ...api,
    listMinistries: async () => ({ ministries: [SCHEDULE.ministry] }),
    listScheduleSummaries: async () => ({
      cycles: [
        {
          ...SCHEDULE.cycle,
          cycleId: SCHEDULE.cycle.id,
          eventCount: 1,
          eventTimeBlockCount: 1,
        },
      ],
    }),
  },
  callerCapabilitiesApi: {
    getCallerCapabilities: async () =>
      callerCapabilitiesFixture({ ledMinistries: 1 }),
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
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  api.getCycleParticipation.mockResolvedValue({ events: [EVENT] });
  api.listSchedules.mockResolvedValue({ schedules: [SCHEDULE] });
  api.listSectors.mockResolvedValue({ sectors: SECTORS });
  api.listMinistryRoles.mockResolvedValue({ roles: ROLES });
});

describe('nested Time block preparation', () => {
  it('loads a block by id and displays its saved headcounts in the shared grid', async () => {
    renderRoute({
      initialPath: EDITOR_PATH,
      churchTimezone: 'America/Sao_Paulo',
    });
    expect(
      await screen.findByRole('checkbox', {
        name: m.usual_setup_serves_label(),
      }),
    ).toBeChecked();
    expect(
      screen.getByRole('spinbutton', {
        name: m.headcount_grid_cell_label({
          role: 'Singer',
          sector: 'Stage',
          shift: m.usual_setup_whole_block_shift(),
        }),
      }),
    ).toHaveValue(2);
    expect(
      screen.getByRole('heading', { name: /Sunday · Night/ }),
    ).toBeVisible();
  });
});

it('saves this block only, omits zero and blank cells, and returns to its refreshed Schedule row', async () => {
  const user = userEvent.setup();
  api.saveEventTimeBlockPreparation.mockResolvedValue(BLOCK);
  const { router, queryClient } = renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  const stage = screen.getByRole('spinbutton', {
    name: /Singer.*Stage|Stage.*Singer/,
  });
  const door = screen.getByRole('spinbutton', {
    name: /Singer.*Door|Door.*Singer/,
  });
  await user.clear(stage);
  await user.type(stage, '4');
  await user.type(door, '0');
  queryClient.setQueryData(['prepare-schedules'], { schedules: [SCHEDULE] });
  api.listSchedules.mockResolvedValue({
    schedules: [{ ...SCHEDULE, stage: 'assigning' }],
  });
  await user.click(screen.getByRole('button', { name: m.usual_setup_save() }));
  expect(api.saveEventTimeBlockPreparation).toHaveBeenCalledWith(
    PARTICIPATION_ID,
    BLOCK_ID,
    {
      serves: true,
      shiftSplit: { kind: 'equal', count: 1 },
      headcounts: [
        {
          shiftIndex: 0,
          sectorId: 'sector-stage',
          roleId: 'role-singer',
          peopleNeeded: 4,
        },
      ],
    },
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(
      `/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    ),
  );
  expect(router.state.location.hash).toBe(`event-time-block-${BLOCK_ID}`);
  expect(queryClient.getQueryData(['prepare-schedules'])).toEqual({
    schedules: [{ ...SCHEDULE, stage: 'assigning' }],
  });
});

it('splits a serving block into equal Shifts and submits independent indexed headcounts', async () => {
  const user = userEvent.setup();
  api.saveEventTimeBlockPreparation.mockResolvedValue(BLOCK);
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  await user.click(
    screen.getByRole('radio', { name: m.shift_split_mode_equal() }),
  );
  for (const [number, count] of [
    [1, '3'],
    [2, '4'],
  ] as const) {
    await user.type(
      screen.getByRole('spinbutton', {
        name: m.headcount_grid_cell_label({
          role: 'Singer',
          sector: 'Stage',
          shift: m.usual_setup_shift_label({ number }),
        }),
      }),
      count,
    );
  }
  await user.click(screen.getByRole('button', { name: m.usual_setup_save() }));
  expect(api.saveEventTimeBlockPreparation).toHaveBeenCalledWith(
    PARTICIPATION_ID,
    BLOCK_ID,
    {
      serves: true,
      shiftSplit: { kind: 'equal', count: 2 },
      headcounts: [
        {
          shiftIndex: 0,
          sectorId: 'sector-stage',
          roleId: 'role-singer',
          peopleNeeded: 3,
        },
        {
          shiftIndex: 1,
          sectorId: 'sector-stage',
          roleId: 'role-singer',
          peopleNeeded: 4,
        },
      ],
    },
  );
});

it('adapts overnight manual Shifts to Instants in the Church Timezone', async () => {
  const user = userEvent.setup();
  api.saveEventTimeBlockPreparation.mockResolvedValue(BLOCK);
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  await user.click(
    screen.getByRole('radio', { name: m.shift_split_mode_manual() }),
  );
  await fillTimeOfDayField({
    user,
    field: screen.getByTestId('shift-split-end-1'),
    time: '00:00',
  });
  await user.click(screen.getByRole('button', { name: m.shift_split_add() }));
  await user.type(
    screen.getByRole('spinbutton', {
      name: m.headcount_grid_cell_label({
        role: 'Singer',
        sector: 'Stage',
        shift: `${m.usual_setup_shift_label({ number: 2 })} · 00:00–02:00`,
      }),
    }),
    '3',
  );
  await user.click(screen.getByRole('button', { name: m.usual_setup_save() }));
  expect(api.saveEventTimeBlockPreparation).toHaveBeenCalledWith(
    PARTICIPATION_ID,
    BLOCK_ID,
    {
      serves: true,
      shiftSplit: {
        kind: 'manual',
        spans: [
          {
            startTime: '2027-01-04T01:00:00.000Z',
            endTime: '2027-01-04T03:00:00.000Z',
          },
          {
            startTime: '2027-01-04T03:00:00.000Z',
            endTime: '2027-01-04T05:00:00.000Z',
          },
        ],
      },
      headcounts: [
        {
          shiftIndex: 1,
          sectorId: 'sector-stage',
          roleId: 'role-singer',
          peopleNeeded: 3,
        },
      ],
    },
  );
});

it('loads saved manual Shifts with their labels and floors cells at active assigned counts', async () => {
  const block = structuredClone(BLOCK);
  const first = structuredClone(SHIFT);
  block.shifts = [first];
  first.label = 'Welcome';
  first.endTime = '2027-01-04T02:00:00.000Z';
  first.requirements = [{ ...REQUIREMENT, assignedCount: 2 }];
  block.shifts.push({
    ...first,
    id: 'shift-2',
    label: 'Closing',
    startTime: '2027-01-04T03:00:00.000Z',
    endTime: '2027-01-04T05:00:00.000Z',
    requirements: [],
  });
  api.getCycleParticipation.mockResolvedValue({
    events: [{ ...EVENT, eventTimeBlocks: [block] }],
  });
  const user = userEvent.setup();
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  const cell = screen.getByRole('spinbutton', {
    name: m.headcount_grid_cell_label({
      role: 'Singer',
      sector: 'Stage',
      shift: 'Welcome · 22:00–23:00',
    }),
  });
  expect(cell).toHaveValue(2);
  await user.clear(cell);
  await user.type(cell, '1');
  expect(cell).toHaveAttribute('aria-invalid', 'true');
  expect(
    screen.getByText(m.headcount_grid_below_minimum({ minimum: 2 })),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: m.usual_setup_save() }),
  ).toBeDisabled();
  expect(api.saveEventTimeBlockPreparation).not.toHaveBeenCalled();
});

function refusal(status: number, data: unknown) {
  return new AxiosError('refused', String(status), undefined, undefined, {
    status,
    data,
  } as AxiosResponse);
}

it('keeps the draft on a below-assigned refusal, updates the cell floor, links it and allows a corrected retry', async () => {
  api.saveEventTimeBlockPreparation
    .mockRejectedValueOnce(
      refusal(409, {
        error: 'HEADCOUNT_BELOW_ASSIGNED',
        message: m.error_headcount_below_assigned(),
        headcountFloors: [
          {
            shiftId: SHIFT_ID,
            sectorId: 'sector-stage',
            roleId: 'role-singer',
            assignedCount: 5,
          },
        ],
      }),
    )
    .mockResolvedValueOnce(BLOCK);
  const user = userEvent.setup();
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  const stage = screen.getByRole('spinbutton', {
    name: /Singer.*Stage|Stage.*Singer/,
  });
  await user.clear(stage);
  await user.type(stage, '4');
  await user.click(screen.getByRole('button', { name: m.usual_setup_save() }));
  expect(
    await screen.findByText(m.error_headcount_below_assigned()),
  ).toBeVisible();
  expect(stage).toHaveValue(4);
  expect(
    screen.getByText(m.headcount_grid_below_minimum({ minimum: 5 })),
  ).toBeVisible();
  expect(
    screen.getByRole('link', {
      name: m.error_headcount_below_assigned_count({ count: 5 }),
    }),
  ).toHaveAttribute('href', '#headcount-22:00-02:00|sector-stage|role-singer');
  expect(
    screen.getByRole('button', { name: m.usual_setup_save() }),
  ).toBeDisabled();
  await user.clear(stage);
  await user.type(stage, '6');
  await user.click(screen.getByRole('button', { name: m.usual_setup_save() }));
  await waitFor(() =>
    expect(api.saveEventTimeBlockPreparation).toHaveBeenCalledTimes(2),
  );
});

it('confirms opt-out with current headcounts and writes only after Save', async () => {
  const user = userEvent.setup();
  api.saveEventTimeBlockPreparation.mockResolvedValue(BLOCK);
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  const toggle = await screen.findByRole('checkbox');
  const stage = screen.getByRole('spinbutton', {
    name: /Singer.*Stage|Stage.*Singer/,
  });
  await user.clear(stage);
  await user.type(stage, '9');
  await user.click(toggle);
  expect(await screen.findByRole('alertdialog')).toHaveTextContent(
    m.prepare_block_confirm_counts({
      shifts: m.usual_setup_shift_count_one(),
      people: m.usual_setup_people_count_other({ count: 9 }),
    }),
  );
  expect(api.saveEventTimeBlockPreparation).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole('button', { name: m.usual_setup_cancel() }),
  );
  expect(toggle).toBeChecked();
  expect(stage).toHaveValue(9);
  await user.click(toggle);
  await user.click(
    screen.getByRole('button', { name: m.prepare_block_confirm_action() }),
  );
  expect(toggle).not.toBeChecked();
  await user.click(screen.getByRole('button', { name: m.usual_setup_save() }));
  expect(api.saveEventTimeBlockPreparation).toHaveBeenCalledWith(
    PARTICIPATION_ID,
    BLOCK_ID,
    { serves: false },
  );
});

it('shows authoritative response and Assignment counts linked to the affected saved Shift without losing a refused split', async () => {
  api.saveEventTimeBlockPreparation.mockRejectedValueOnce(
    refusal(409, {
      error: 'SHIFT_HAS_RESPONSES',
      message: m.error_shift_has_responses(),
      shiftResponses: [
        { shiftId: SHIFT_ID, unavailableMarkCount: 3, assignmentCount: 2 },
      ],
    }),
  );
  const user = userEvent.setup();
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  await user.click(
    screen.getByRole('radio', { name: m.shift_split_mode_equal() }),
  );
  const stage = screen.getByRole('spinbutton', {
    name: m.headcount_grid_cell_label({
      role: 'Singer',
      sector: 'Stage',
      shift: m.usual_setup_shift_label({ number: 1 }),
    }),
  });
  await user.type(stage, '3');
  await user.click(screen.getByRole('button', { name: m.usual_setup_save() }));
  expect(
    await screen.findByRole('link', {
      name: m.prepare_block_answers_other({ count: 3 }),
    }),
  ).toHaveAttribute('href', `#preparation-shift-${SHIFT_ID}`);
  expect(
    screen.getByRole('link', {
      name: m.prepare_block_assignments_other({ count: 2 }),
    }),
  ).toHaveAttribute('href', `#preparation-shift-${SHIFT_ID}`);
  expect(
    document.getElementById(`preparation-shift-${SHIFT_ID}`),
  ).toHaveTextContent('22:00');
  expect(stage).toHaveValue(3);
  expect(
    screen.getByRole('radio', { name: m.shift_split_mode_equal() }),
  ).toBeChecked();
});

it('warns before leaving an unsaved form, keeps edits when staying, and cancels without writing', async () => {
  const user = userEvent.setup();
  const { router } = renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  const stage = screen.getByRole('spinbutton', {
    name: /Singer.*Stage|Stage.*Singer/,
  });
  await user.type(stage, '9');
  await user.click(
    screen.getByRole('button', { name: m.usual_setup_cancel() }),
  );
  expect(await screen.findByRole('alertdialog')).toHaveTextContent(
    m.prepare_block_leave_title(),
  );
  await user.click(
    screen.getByRole('button', { name: m.prepare_block_stay() }),
  );
  expect(stage).toHaveValue(29);
  expect(router.state.location.pathname).toBe(EDITOR_PATH);
  await user.click(
    screen.getByRole('button', { name: m.usual_setup_cancel() }),
  );
  await user.click(
    screen.getByRole('button', { name: m.prepare_block_leave() }),
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(
      `/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    ),
  );
  expect(api.saveEventTimeBlockPreparation).not.toHaveBeenCalled();
});

it('keeps a published participation editable for an Event added to the Sent Cycle', async () => {
  api.getCycleParticipation.mockResolvedValue({
    events: [
      {
        ...EVENT,
        participation: { ...EVENT.participation, state: 'published' },
      },
    ],
  });
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  const toggle = await screen.findByRole('checkbox');
  expect(toggle).not.toHaveAttribute('aria-disabled', 'true');
  expect(screen.queryByText(m.prepare_block_read_only())).toBeNull();
  expect(
    screen.getByRole('button', { name: m.usual_setup_save() }),
  ).toBeVisible();
});

it('renders past preparation read-only', async () => {
  api.listSchedules.mockResolvedValue({
    schedules: [{ ...SCHEDULE, cycle: { ...SCHEDULE.cycle, state: 'past' } }],
  });
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  const toggle = await screen.findByRole('checkbox');
  expect(toggle).toHaveAttribute('aria-disabled', 'true');
  await userEvent.setup().click(toggle);
  expect(toggle).toBeChecked();
  expect(screen.getByText(m.prepare_block_read_only())).toBeVisible();
  expect(
    screen.getByRole('button', { name: m.usual_setup_cancel() }),
  ).toBeEnabled();
  expect(
    screen
      .getAllByRole('spinbutton')
      .every((input) => input.hasAttribute('disabled')),
  ).toBe(true);
  expect(
    screen.queryByRole('button', { name: m.usual_setup_save() }),
  ).toBeNull();
  expect(api.saveEventTimeBlockPreparation).not.toHaveBeenCalled();
});

it.each([
  [403, () => m.shell_no_access()],
  [404, () => m.error_not_found()],
  [500, () => m.prepare_block_load_failed()],
] as const)('shows a scoped read failure (%s) instead of an empty or editable form', async (status, message) => {
  api.getCycleParticipation.mockRejectedValueOnce(
    refusal(status, { error: 'READ_FAILED', message: 'failed' }),
  );
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(await screen.findByText(message())).toBeVisible();
  expect(screen.queryByRole('checkbox')).toBeNull();
  if (status === 500) {
    api.getCycleParticipation.mockResolvedValue({ events: [EVENT] });
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: m.schedules_retry() }));
    expect(await screen.findByRole('checkbox')).toBeChecked();
  }
});

it('disables serving Save for invalid, blank and zero headcounts', async () => {
  const user = userEvent.setup();
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  const stage = screen.getByRole('spinbutton', {
    name: /Singer.*Stage|Stage.*Singer/,
  });
  for (const value of ['1.5', '', '0']) {
    await user.clear(stage);
    if (value) await user.type(stage, value);
    expect(
      screen.getByRole('button', { name: m.usual_setup_save() }),
    ).toBeDisabled();
  }
  expect(api.saveEventTimeBlockPreparation).not.toHaveBeenCalled();
});

it('saves an untouched first opt-in through the server Usual setup re-seed contract', async () => {
  const block = { ...BLOCK, included: false, shifts: [] };
  api.getCycleParticipation.mockResolvedValue({
    events: [{ ...EVENT, eventTimeBlocks: [block] }],
  });
  api.saveEventTimeBlockPreparation.mockResolvedValue(BLOCK);
  const user = userEvent.setup();
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  const toggle = await screen.findByRole('checkbox');
  expect(toggle).not.toBeChecked();
  expect(screen.queryByRole('spinbutton')).toBeNull();
  await user.click(toggle);
  expect(screen.getByText(m.prepare_block_initial_opt_in())).toBeVisible();
  await user.click(screen.getByRole('button', { name: m.usual_setup_save() }));
  expect(api.saveEventTimeBlockPreparation).toHaveBeenCalledWith(
    PARTICIPATION_ID,
    BLOCK_ID,
    { serves: true },
  );
});

it('opens missing registry shortcuts in new tabs and refreshes on focus while keeping a dirty draft', async () => {
  api.listSectors.mockResolvedValue({ sectors: [] });
  api.listMinistryRoles.mockResolvedValue({ roles: [] });
  const user = userEvent.setup();
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  expect(screen.getByText(m.usual_setup_missing_sectors())).toBeVisible();
  expect(screen.getByText(m.usual_setup_missing_roles())).toBeVisible();
  for (const [name, tab] of [
    [m.prepare_set_up_sectors(), 'sectors'],
    [m.usual_setup_set_up_roles(), 'roles'],
  ] as const) {
    const link = screen.getByRole('link', { name: new RegExp(name) });
    expect(link).toHaveAttribute('href', `/ministries/${MINISTRY_ID}/${tab}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveTextContent(m.sectors_opens_new_tab());
  }
  expect(
    screen.getByRole('button', { name: m.usual_setup_save() }),
  ).toBeDisabled();
  api.listSectors.mockResolvedValue({ sectors: SECTORS });
  api.listMinistryRoles.mockResolvedValue({ roles: ROLES });
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  const stage = await screen.findByRole('spinbutton', {
    name: /Singer.*Stage|Stage.*Singer/,
  });
  await user.clear(stage);
  await user.type(stage, '7');
  api.listSectors.mockResolvedValue({
    sectors: [...SECTORS, { id: 'sector-lobby', name: 'Lobby' }],
  });
  const changed = {
    ...EVENT,
    eventTimeBlocks: [
      {
        ...BLOCK,
        shifts: [
          { ...SHIFT, requirements: [{ ...REQUIREMENT, peopleNeeded: 8 }] },
        ],
      },
    ],
  };
  api.getCycleParticipation.mockResolvedValue({ events: [changed] });
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  await screen.findByRole('spinbutton', {
    name: /Singer.*Lobby|Lobby.*Singer/,
  });
  expect(stage).toHaveValue(7);
});

it('keeps the draft visible and disables controls while a save is pending', async () => {
  let finishSave: (block: PreparationBlock) => void = () => {
    throw new Error('save was not started');
  };
  api.saveEventTimeBlockPreparation.mockReturnValueOnce(
    new Promise<PreparationBlock>((resolve) => {
      finishSave = resolve;
    }),
  );
  const user = userEvent.setup();
  const { router } = renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  const stage = screen.getByRole('spinbutton', {
    name: /Singer.*Stage|Stage.*Singer/,
  });
  await user.clear(stage);
  await user.type(stage, '4');
  await user.click(screen.getByRole('button', { name: m.usual_setup_save() }));
  expect(
    await screen.findByRole('button', { name: m.usual_setup_saving() }),
  ).toBeDisabled();
  expect(stage).toBeDisabled();
  expect(stage).toHaveValue(4);
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
  expect(
    screen.getByRole('button', { name: m.usual_setup_cancel() }),
  ).toBeDisabled();
  await act(async () => {
    void router.navigate({ to: '/schedules' });
  });
  await screen.findByRole('alertdialog');
  expect(
    screen.getByRole('button', { name: m.prepare_block_leave() }),
  ).toBeDisabled();
  expect(router.state.location.pathname).toBe(EDITOR_PATH);
  await act(async () => {
    finishSave(BLOCK);
  });
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(
      `/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    ),
  );
});

it('preserves exact saved manual Instants during a headcount-only edit', async () => {
  const block = structuredClone(BLOCK);
  const first = structuredClone(SHIFT);
  block.shifts = [first];
  first.label = 'Welcome';
  first.endTime = '2027-01-04T02:00:30.123Z';
  first.unavailableMarkCount = 3;
  block.shifts.push({
    ...first,
    id: 'shift-2',
    label: 'Closing',
    startTime: '2027-01-04T03:00:45.456Z',
    endTime: '2027-01-04T05:00:00.000Z',
    requirements: [],
  });
  api.getCycleParticipation.mockResolvedValue({
    events: [{ ...EVENT, eventTimeBlocks: [block] }],
  });
  api.saveEventTimeBlockPreparation.mockResolvedValue(block);
  const user = userEvent.setup();
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  const stage = screen.getByRole('spinbutton', {
    name: m.headcount_grid_cell_label({
      role: 'Singer',
      sector: 'Stage',
      shift: 'Welcome · 22:00–23:00',
    }),
  });
  await user.clear(stage);
  await user.type(stage, '4');
  await user.click(screen.getByRole('button', { name: m.usual_setup_save() }));
  expect(api.saveEventTimeBlockPreparation).toHaveBeenCalledWith(
    PARTICIPATION_ID,
    BLOCK_ID,
    expect.objectContaining({
      shiftSplit: {
        kind: 'manual',
        spans: [
          {
            label: 'Welcome',
            startTime: '2027-01-04T01:00:00.000Z',
            endTime: '2027-01-04T02:00:30.123Z',
          },
          {
            label: 'Closing',
            startTime: '2027-01-04T03:00:45.456Z',
            endTime: '2027-01-04T05:00:00.000Z',
          },
        ],
      },
    }),
  );
});

it('still confirms persisted staffing before opting out of an invalid split draft', async () => {
  const user = userEvent.setup();
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  const toggle = await screen.findByRole('checkbox');
  await user.click(
    screen.getByRole('radio', { name: m.shift_split_mode_equal() }),
  );
  const count = screen.getByRole('spinbutton', {
    name: m.shift_split_equal_count(),
  });
  await user.clear(count);
  await user.type(count, '0');
  await user.click(toggle);
  expect(await screen.findByRole('alertdialog')).toHaveTextContent(
    m.prepare_block_confirm_counts({
      shifts: m.usual_setup_shift_count_one(),
      people: m.usual_setup_people_count_other({ count: 2 }),
    }),
  );
});

it('refreshes the Cycle state after a concurrent transition refuses the save and keeps the draft read-only', async () => {
  api.saveEventTimeBlockPreparation.mockRejectedValueOnce(
    refusal(409, {
      error: 'ILLEGAL_STATE_TRANSITION',
      message: m.error_illegal_state_transition(),
    }),
  );
  const user = userEvent.setup();
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  const stage = screen.getByRole('spinbutton', {
    name: /Singer.*Stage|Stage.*Singer/,
  });
  await user.clear(stage);
  await user.type(stage, '4');
  api.listSchedules.mockResolvedValue({
    schedules: [{ ...SCHEDULE, cycle: { ...SCHEDULE.cycle, state: 'past' } }],
  });
  await user.click(screen.getByRole('button', { name: m.usual_setup_save() }));
  expect(await screen.findByText(m.prepare_block_read_only())).toBeVisible();
  expect(stage).toHaveValue(4);
  expect(stage).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: m.usual_setup_save() }),
  ).toBeNull();
});

it('uses fresh assigned floors after refocus instead of retaining an obsolete refusal floor', async () => {
  api.saveEventTimeBlockPreparation.mockRejectedValueOnce(
    refusal(409, {
      error: 'HEADCOUNT_BELOW_ASSIGNED',
      message: m.error_headcount_below_assigned(),
      headcountFloors: [
        {
          shiftId: SHIFT_ID,
          sectorId: 'sector-stage',
          roleId: 'role-singer',
          assignedCount: 5,
        },
      ],
    }),
  );
  const user = userEvent.setup();
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  const stage = screen.getByRole('spinbutton', {
    name: /Singer.*Stage|Stage.*Singer/,
  });
  await user.clear(stage);
  await user.type(stage, '4');
  await user.click(screen.getByRole('button', { name: m.usual_setup_save() }));
  await screen.findByText(m.headcount_grid_below_minimum({ minimum: 5 }));
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  await waitFor(() =>
    expect(api.getCycleParticipation).toHaveBeenCalledTimes(2),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: m.usual_setup_save() }),
    ).toBeEnabled(),
  );
  expect(stage).toHaveValue(4);
});

it.each([
  'availability_requested',
  'assigning',
] as const)('keeps headcounts editable while %s', async (state) => {
  api.getCycleParticipation.mockResolvedValue({
    events: [{ ...EVENT, participation: { ...EVENT.participation, state } }],
  });
  api.saveEventTimeBlockPreparation.mockResolvedValue(BLOCK);
  const user = userEvent.setup();
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  const stage = screen.getByRole('spinbutton', {
    name: /Singer.*Stage|Stage.*Singer/,
  });
  await user.clear(stage);
  await user.type(stage, '4');
  await user.click(screen.getByRole('button', { name: m.usual_setup_save() }));
  expect(api.saveEventTimeBlockPreparation).toHaveBeenCalledWith(
    PARTICIPATION_ID,
    BLOCK_ID,
    expect.objectContaining({
      headcounts: [
        {
          shiftIndex: 0,
          sectorId: 'sector-stage',
          roleId: 'role-singer',
          peopleNeeded: 4,
        },
      ],
    }),
  );
});

it('treats an id outside the scoped prepare read as not found', async () => {
  renderRoute({
    initialPath: EDITOR_PATH.replace(
      BLOCK_ID,
      '99999999-9999-4999-8999-999999999999',
    ),
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(await screen.findByText(m.error_not_found())).toBeVisible();
  expect(screen.queryByRole('checkbox')).toBeNull();
});

it('keeps loading distinct from an empty or editable block', async () => {
  api.getCycleParticipation.mockReturnValueOnce(new Promise(() => {}));
  const { container } = renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await waitFor(() =>
    expect(container.querySelector('[aria-busy="true"]')).toBeVisible(),
  );
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByText(m.usual_setup_missing_sectors())).toBeNull();
});

it('retains a dirty form when a focus refetch fails', async () => {
  const user = userEvent.setup();
  const { queryClient } = renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  const stage = screen.getByRole('spinbutton', {
    name: /Singer.*Stage|Stage.*Singer/,
  });
  await user.clear(stage);
  await user.type(stage, '7');
  api.listSectors.mockRejectedValueOnce(new Error('offline'));
  await act(async () => {
    await queryClient.refetchQueries();
  });
  expect(await screen.findByText(m.prepare_block_load_failed())).toBeVisible();
  expect(stage).toHaveValue(7);
});

it.each([
  [400, 'INVALID_SHIFT_SPLIT', m.error_invalid_shift_split],
  [404, 'NOT_FOUND', m.error_not_found],
  [422, 'VALIDATION_ERROR', m.common_generic_error],
  [500, 'INTERNAL_ERROR', m.common_generic_error],
] as const)('keeps entries and permits retry after a save failure (%s)', async (status, error, message) => {
  const failure =
    status === 500
      ? new Error('offline')
      : refusal(status, { error, message: message() });
  api.saveEventTimeBlockPreparation
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce(BLOCK);
  const user = userEvent.setup();
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  const stage = screen.getByRole('spinbutton', {
    name: /Singer.*Stage|Stage.*Singer/,
  });
  await user.clear(stage);
  await user.type(stage, '4');
  await user.click(screen.getByRole('button', { name: m.usual_setup_save() }));
  expect(await screen.findByText(message())).toBeVisible();
  expect(stage).toHaveValue(4);
  await user.click(screen.getByRole('button', { name: m.usual_setup_save() }));
  await waitFor(() =>
    expect(api.saveEventTimeBlockPreparation).toHaveBeenCalledTimes(2),
  );
});

it('saves headcounts for existing multi-day manual Shifts without losing their days', async () => {
  const block = structuredClone(BLOCK);
  block.eventTimeBlock.startTime = '2027-01-08T11:00:00.000Z';
  block.eventTimeBlock.endTime = '2027-01-09T23:00:00.000Z';
  block.shifts = [
    {
      ...SHIFT,
      label: 'Friday',
      startTime: '2027-01-08T11:00:00.000Z',
      endTime: '2027-01-08T23:00:00.000Z',
    },
    {
      ...SHIFT,
      id: 'shift-2',
      label: 'Overnight',
      startTime: '2027-01-08T23:00:00.000Z',
      endTime: '2027-01-09T23:00:00.000Z',
      requirements: [],
    },
  ];
  api.getCycleParticipation.mockResolvedValue({
    events: [
      {
        ...EVENT,
        event: {
          ...EVENT.event,
          start: block.eventTimeBlock.startTime,
          end: block.eventTimeBlock.endTime,
        },
        eventTimeBlocks: [block],
      },
    ],
  });
  api.saveEventTimeBlockPreparation.mockResolvedValue(block);
  const user = userEvent.setup();
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  expect(
    screen.getByRole('radio', { name: m.shift_split_mode_manual() }),
  ).toBeChecked();
  const stage = screen.getByRole('spinbutton', {
    name: /Singer.*Stage.*Friday|Friday.*Singer.*Stage/,
  });
  expect(stage).toHaveValue(2);
  await user.clear(stage);
  await user.type(stage, '4');
  const save = screen.getByRole('button', { name: m.usual_setup_save() });
  expect(save).toBeEnabled();
  await user.click(save);
  expect(api.saveEventTimeBlockPreparation).toHaveBeenCalledWith(
    PARTICIPATION_ID,
    BLOCK_ID,
    {
      serves: true,
      shiftSplit: {
        kind: 'manual',
        spans: [
          {
            label: 'Friday',
            startTime: '2027-01-08T11:00:00.000Z',
            endTime: '2027-01-08T23:00:00.000Z',
          },
          {
            label: 'Overnight',
            startTime: '2027-01-08T23:00:00.000Z',
            endTime: '2027-01-09T23:00:00.000Z',
          },
        ],
      },
      headcounts: [
        {
          shiftIndex: 0,
          sectorId: 'sector-stage',
          roleId: 'role-singer',
          peopleNeeded: 4,
        },
      ],
    },
  );
});

it('keeps a saved manual Shift on its CalendarDays when its shared time controls change', async () => {
  const block = structuredClone(BLOCK);
  block.eventTimeBlock.startTime = '2027-01-08T11:00:00.000Z';
  block.eventTimeBlock.endTime = '2027-01-10T23:00:00.000Z';
  block.shifts = [
    {
      ...SHIFT,
      label: 'Friday',
      startTime: '2027-01-08T11:00:00.000Z',
      endTime: '2027-01-08T23:00:00.000Z',
    },
    {
      ...SHIFT,
      id: 'shift-2',
      label: 'Weekend',
      startTime: '2027-01-09T11:00:00.000Z',
      endTime: '2027-01-10T11:00:00.000Z',
      requirements: [],
    },
  ];
  api.getCycleParticipation.mockResolvedValue({
    events: [
      {
        ...EVENT,
        event: {
          ...EVENT.event,
          start: block.eventTimeBlock.startTime,
          end: block.eventTimeBlock.endTime,
        },
        eventTimeBlocks: [block],
      },
    ],
  });
  api.saveEventTimeBlockPreparation.mockResolvedValue(block);
  const user = userEvent.setup();
  renderRoute({
    initialPath: EDITOR_PATH,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByRole('checkbox');
  await fillTimeOfDayField({
    user,
    field: screen.getByTestId('shift-split-start-2'),
    time: '09:00',
  });
  await fillTimeOfDayField({
    user,
    field: screen.getByTestId('shift-split-end-2'),
    time: '07:00',
  });
  const save = screen.getByRole('button', { name: m.usual_setup_save() });
  expect(save).toBeEnabled();
  await user.click(save);
  expect(api.saveEventTimeBlockPreparation).toHaveBeenCalledWith(
    PARTICIPATION_ID,
    BLOCK_ID,
    expect.objectContaining({
      shiftSplit: {
        kind: 'manual',
        spans: [
          {
            label: 'Friday',
            startTime: '2027-01-08T11:00:00.000Z',
            endTime: '2027-01-08T23:00:00.000Z',
          },
          {
            label: 'Weekend',
            startTime: '2027-01-09T12:00:00.000Z',
            endTime: '2027-01-10T10:00:00.000Z',
          },
        ],
      },
    }),
  );
});
