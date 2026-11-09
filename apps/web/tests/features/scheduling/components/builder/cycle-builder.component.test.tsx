import type { AppConfig } from '@church/app-config';
import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { parseInstant, resetClock, setTestClock } from '@church/time';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import {
  afterEach,
  beforeEach,
  beforeEach as beforeEachLocale,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CycleBuilder } from '@/features/scheduling/components/builder/cycle-builder';
import type { CycleBuilderData } from '@/features/scheduling/hooks/use-cycle-builder';
import { renderWithProviders } from '@/tests/setup/render';

beforeEachLocale(() => overwriteGetLocale(() => 'en'));

const parked = vi.hoisted(() => ({ auditPanel: true }));

vi.mock('@church/app-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@church/app-config')>();
  return {
    ...actual,
    appConfig: {
      ...actual.appConfig,
      get parked() {
        return {
          ...actual.withAllParkedOn(actual.appConfig).parked,
          ...parked,
        };
      },
    } as AppConfig,
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const builderData: CycleBuilderData = {
  assignments: [],
  roles: [{ id: 'role-1', name: 'Greeter' }],
  events: [
    {
      participationId: 'participation-1',
      state: 'assigning',
      eventId: 'event-1',
      title: 'Sunday Gathering',
      start: '2026-08-02T09:00:00.000Z',
      end: '2026-08-02T11:00:00.000Z',
      status: 'scheduled',
      fillRatio: 0,
      peopleNeeded: 1,
      assignedCount: 0,
      eventTimeBlockCount: 1,
      eventTimeBlocks: [
        {
          eventTimeBlockId: 'event-time-block-1',
          label: 'Morning service',
          startTime: '2026-08-02T09:00:00.000Z',
          endTime: '2026-08-02T11:00:00.000Z',
          included: true,
          peopleNeeded: 1,
          assignedCount: 0,
          shiftCount: 1,
          shifts: [
            {
              shiftId: 'shift-1',
              label: 'Morning service',
              eventTimeBlockId: 'event-time-block-1',
              startTime: '2026-08-02T09:00:00.000Z',
              endTime: '2026-08-02T11:00:00.000Z',
              peopleNeeded: 1,
              assignedCount: 0,
              requirements: [
                {
                  id: 'requirement-role-1',
                  roleId: 'role-1',
                  sectorName: 'Main',
                  peopleNeeded: 1,
                },
              ],
              assignments: [],
              eligibleVolunteerCount: 1,
              eligibleVolunteers: [
                {
                  volunteerId: 'volunteer-1',
                  volunteerName: 'Grace Hopper',
                  answerState: 'available',
                  conflict: null,
                  qualifiedRoleIds: ['role-1'],
                  ministryAccessLevel: 'volunteer',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const existingAssignment = {
  id: 'assignment-1',
  churchId: 'church-1',
  eventTimeBlockId: 'event-time-block-1',
  participationId: 'participation-1',
  shiftId: 'shift-1',
  volunteerId: 'volunteer-1',
  roleId: 'role-1',
  shiftRequirementId: 'requirement-role-1',
  status: 'confirmed',
  assignedAt: '2026-07-01T10:00:00.000Z',
  lateMark: false,
  volunteerName: 'Grace Hopper',
} as const;

interface BoardDataInput {
  start?: string;
  state?: string;
}

function boardData({ start, state }: BoardDataInput): CycleBuilderData {
  const event = builderData.events[0];
  const eventTimeBlock = event.eventTimeBlocks[0];
  const shift = eventTimeBlock.shifts[0];
  return {
    ...builderData,
    assignments: [existingAssignment],
    events: [
      {
        ...event,
        start: start ?? event.start,
        state: state ?? event.state,
        assignedCount: 1,
        eventTimeBlocks: [
          {
            ...eventTimeBlock,
            assignedCount: 1,
            shifts: [
              {
                ...shift,
                peopleNeeded: 2,
                assignedCount: 1,
                requirements: [
                  {
                    ...shift.requirements[0],
                    peopleNeeded: 2,
                  },
                ],
                assignments: [existingAssignment],
                eligibleVolunteers: shift.eligibleVolunteers.map(
                  (volunteer) => ({ ...volunteer }),
                ),
              },
            ],
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  setTestClock({
    instant: parseInstant({ value: '2026-08-01T12:00:00.000Z' }),
  });
});

afterEach(() => resetClock());

interface RenderBuilderInput {
  createAssignment?: () => Promise<unknown>;
  moveAssignment?: () => Promise<unknown>;
  data?: CycleBuilderData;
}

function renderBuilder({
  createAssignment,
  moveAssignment,
  data = builderData,
}: RenderBuilderInput = {}) {
  const mutateAsync = vi.fn(createAssignment ?? (() => Promise.resolve({})));
  const move = vi.fn(moveAssignment ?? (() => Promise.resolve({})));
  renderWithProviders(
    <CycleBuilder
      data={data}
      onPublish={vi.fn()}
      isPublishing={false}
      cycleId="cycle-1"
      ministryId="ministry-1"
      cycleName="Agosto 2026"
      cycleStartDate="2026-08-01"
      cycleEndDate="2026-08-31"
      createAssignment={{ isPending: false, mutateAsync }}
      deleteAssignment={{ isPending: false, mutateAsync: vi.fn() }}
      reassignAssignment={{ isPending: false, mutateAsync: vi.fn() }}
      moveAssignment={{ isPending: false, mutateAsync: move }}
    />,
  );
  return { mutateAsync, move };
}

async function assignGraceHopper() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await user.click(await screen.findByTestId('suggestion-option'));
}

describe('moving assignments', () => {
  it('keeps a failed move on the destination with a retry', async () => {
    const data = structuredClone(builderData);
    const shift = data.events[0].eventTimeBlocks[0].shifts[0];
    shift.requirements.push({
      id: 'side',
      roleId: 'role-1',
      sectorName: 'Side',
      peopleNeeded: 1,
    });
    shift.assignments.push(existingAssignment);
    data.assignments.push(existingAssignment);
    const { move } = renderBuilder({
      data,
      moveAssignment: () => Promise.reject(new Error('No connection')),
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('assignment-chip'));
    await user.click(screen.getByRole('button', { name: 'Move' }));
    await user.click(screen.getByRole('button', { name: 'Side' }));
    expect(move).toHaveBeenCalledWith({
      assignmentId: 'assignment-1',
      body: { shiftRequirementId: 'side' },
    });
    expect(
      await screen.findByTestId('cycle-failed-assignment-retry'),
    ).toBeVisible();
    await user.click(screen.getByTestId('cycle-failed-assignment-retry'));
    await waitFor(() => expect(move).toHaveBeenCalledTimes(2));
  });
});

describe('CycleBuilder rail selection wiring (#217)', () => {
  // apps/web/tests/scheduling/builder-reverse-highlight.spec.ts (moved down):
  // the override/unqualified/none tiers already have direct cell-level proof
  // (cycle-builder-cell.component.test.tsx) and the rail's own selection
  // toggle has card-level proof (volunteer-card.component.test.tsx); what was
  // still only proven end-to-end was the plumbing this composed render
  // exercises — a rail pick reaching the matching cell as the 'ready' tier,
  // and clearing it putting the board back.
  it('lights the cell a selected volunteer fits and clearing the pick puts it back', async () => {
    const user = userEvent.setup();
    renderBuilder();

    const cell = screen.getByTestId('cycle-requirement-requirement-role-1');
    expect(cell).toHaveAttribute('data-selected-fit', 'none');

    const selectShift = screen.getAllByTestId('volunteer-select-shift')[0];
    await user.click(selectShift);

    expect(cell).toHaveAttribute('data-selected-fit', 'ready');
    expect(selectShift).toHaveAttribute('aria-pressed', 'true');

    await user.click(selectShift);

    expect(cell).toHaveAttribute('data-selected-fit', 'none');
  });
});

describe('CycleBuilder header (B-4)', () => {
  it('replaces the hero with the cycle, its window, and how much of it is done', () => {
    renderBuilder();

    const header = screen.getByTestId('cycle-builder-header');
    expect(header).toHaveTextContent('Agosto 2026');
    expect(header).toHaveTextContent('01/08 – 31/08/2026');
    // One shift, one required role, nobody on it yet — read straight off the
    // builder data, so it tracks every write the board applies.
    expect(header).toHaveTextContent('0 of 1 place filled');
    expect(header).toHaveTextContent('1 shift is below target');
    // The plain inventory counters Planning and Prepare also carry.
    expect(screen.getByTestId('cycle-builder-event-count')).toHaveTextContent(
      '1',
    );
    expect(
      screen.getByTestId('cycle-builder-event-time-block-count'),
    ).toHaveTextContent('1');
    expect(screen.getByTestId('cycle-builder-shift-count')).toHaveTextContent(
      '1',
    );
    expect(
      screen.getByTestId('cycle-builder-assigned-count'),
    ).toHaveTextContent('0');
    expect(
      screen.queryByText(/Map the cycle, then place with confidence/),
    ).not.toBeInTheDocument();
  });
});

describe('Unavailable assignment confirmation', () => {
  function unavailableData(): CycleBuilderData {
    const data = structuredClone(builderData);
    data.events[0].eventTimeBlocks[0].shifts[0].eligibleVolunteers[0].answerState =
      'unavailable';
    data.events[0].eventTimeBlocks[0].shifts[0].label = 'Kids shift';
    return data;
  }

  it('cancels without writing and confirms the named volunteer and shift once', async () => {
    const user = userEvent.setup();
    const { mutateAsync } = renderBuilder({ data: unavailableData() });
    await assignGraceHopper();
    expect(screen.getByRole('dialog')).toHaveTextContent('Grace Hopper');
    expect(screen.getByRole('dialog')).toHaveTextContent('Kids shift');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', {
        name: m.builder_unavailable_confirm_cancel(),
      }),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
    await assignGraceHopper();
    await user.click(
      screen.getByRole('button', {
        name: m.builder_unavailable_confirm_action(),
      }),
    );
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());
  });
});

describe('Assignment refusal', () => {
  it('shows the localized HTTP refusal in the failed write', async () => {
    const error = new AxiosError(
      'Request failed with status code 409',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        data: { error: 'HARD_CONSTRAINT_VIOLATION', message: 'Already booked' },
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config: { headers: new AxiosHeaders() },
      },
    );
    renderBuilder({ createAssignment: () => Promise.reject(error) });
    await assignGraceHopper();
    expect(await screen.findByText('Already booked')).toBeVisible();
  });

  it('shows the server refusal without offering collision actions', async () => {
    const data = structuredClone(builderData);
    data.assignments = [
      { ...existingAssignment, id: 'elsewhere', shiftId: 'other-shift' },
    ];
    renderBuilder({
      data,
      createAssignment: () => Promise.reject(new Error('Volunteer is booked')),
    });

    await assignGraceHopper();

    expect(await screen.findByText('Assignment failed')).toBeVisible();
    expect(
      screen.queryByText('Volunteer already assigned'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Assign to both')).not.toBeInTheDocument();
  });
});

describe('CycleBuilder assignment announcements (B-3)', () => {
  it('announces a saved assignment in a live region, not only in a toast', async () => {
    renderBuilder();

    const announcer = screen.getByTestId('cycle-builder-announcer');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(announcer).toHaveTextContent('');

    await assignGraceHopper();

    // Sonner renders away from the board a screen-reader user is on, so the
    // only signal a write landed used to be visual.
    await waitFor(() =>
      expect(announcer).toHaveTextContent(
        'Assigned Grace Hopper to Morning service',
      ),
    );
  });

  it('announces a rejected assignment, naming the person and the time block', async () => {
    renderBuilder({
      createAssignment: () => Promise.reject(new Error('Volunteer is booked')),
    });

    await assignGraceHopper();

    await waitFor(() =>
      expect(screen.getByTestId('cycle-builder-announcer')).toHaveTextContent(
        'Could not assign Grace Hopper to Morning service: Assignment failed',
      ),
    );
  });
});

describe('CycleBuilder toolbar and requirement affordances', () => {
  it('opens the Audit log panel when the switch is on', async () => {
    renderBuilder();

    await userEvent.click(screen.getByRole('button', { name: 'Audit log' }));

    expect(await screen.findByText('Audit Log')).toBeVisible();
  });

  it('hides the Audit log button when the switch is off', () => {
    parked.auditPanel = false;
    try {
      renderBuilder();

      expect(
        screen.getByRole('button', { name: 'Publish cycle' }),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Audit log' }),
      ).not.toBeInTheDocument();
    } finally {
      parked.auditPanel = true;
    }
  });

  it('preserves the admin board affordances across time and participation state', () => {
    renderBuilder({
      data: boardData({
        start: '2026-08-01T12:00:00.000Z',
        state: 'published',
      }),
    });

    expect(screen.getByRole('button', { name: 'Publish cycle' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Audit log' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add' })).toBeVisible();
    expect(
      screen.getByTestId('cycle-requirement-requirement-role-1'),
    ).toHaveAttribute('data-drop-target', 'append');
    expect(screen.getByTestId('cycle-assignment-assignment-1')).toHaveAttribute(
      'data-drop-target',
      'replace',
    );
    expect(screen.getAllByTestId('volunteer-select-shift')).not.toHaveLength(0);
    for (const grip of screen.getAllByTestId('volunteer-card-grip')) {
      expect(grip).not.toBeDisabled();
    }
  });
});
