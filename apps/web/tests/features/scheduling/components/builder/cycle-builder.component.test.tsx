import type { AppConfig } from '@church/app-config';
import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { parseInstant, resetClock, setTestClock } from '@church/time';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  afterEach,
  beforeEach,
  beforeEach as beforeEachLocale,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import * as picker from '@/features/scheduling/components/builder/assignment/assignment-picker';
import { CycleBuilder } from '@/features/scheduling/components/builder/cycle-builder';
import type { LeaderSwapRequest } from '@/features/scheduling/components/builder/swap-request/swap-request-sheet';
import type { CycleBuilderData } from '@/features/scheduling/hooks/use-cycle-builder';
import { renderWithProviders } from '@/tests/setup/render';
import { adminApi } from '@/utils/api-instances';
import * as volunteerName from '@/utils/format-volunteer-name';

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

const swapContextConsumer = vi.hoisted(() => vi.fn());

vi.mock(
  '@/features/scheduling/components/builder/swap-request/swap-request-context',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/scheduling/components/builder/swap-request/swap-request-context')
      >();
    const React = await import('react');
    const Consumer = React.memo(() => {
      swapContextConsumer(actual.useSwapRequestBoard());
      return null;
    });
    const Provider = ({
      value,
      children,
    }: React.ComponentProps<typeof actual.SwapRequestBoardProvider>) =>
      React.createElement(
        actual.SwapRequestBoardProvider,
        { value },
        children,
        React.createElement(Consumer),
      );
    return { ...actual, SwapRequestBoardProvider: Provider };
  },
);

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

afterEach(() => {
  resetClock();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

interface RenderBuilderInput {
  createAssignment?: () => Promise<unknown>;
  moveAssignment?: () => Promise<unknown>;
  data?: CycleBuilderData;
  swapRequests?: LeaderSwapRequest[];
  selectedSwapRequestId?: string;
  onSelectSwapRequest?: (id: string | undefined) => void;
}

function renderBuilder({
  createAssignment,
  moveAssignment,
  data = builderData,
  swapRequests,
  selectedSwapRequestId,
  onSelectSwapRequest,
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
      swapRequests={swapRequests}
      selectedSwapRequestId={selectedSwapRequestId}
      onSelectSwapRequest={onSelectSwapRequest}
    />,
  );
  return { mutateAsync, move };
}

async function assignGraceHopper() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await user.click(await screen.findByTestId('suggestion-option'));
}

// JSDOM has no layout: model the source, drop zones and dnd-kit overlay at
// the dimensions a browser computes from the overlay's inline size.
function setupDragGeometry() {
  class TestPointerEvent extends MouseEvent {
    readonly isPrimary = true;
    readonly pointerId = 1;
  }
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  return vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const id = this.dataset.testid;
      const x =
        id === 'cycle-requirement-side'
          ? 100
          : id === 'cycle-requirement-wrong-role'
            ? 200
            : id === 'cycle-requirement-wrong-shift'
              ? 300
              : 0;
      const size =
        id === 'volunteer-card' ||
        id === 'cycle-requirement-side' ||
        id === 'cycle-requirement-wrong-role' ||
        id === 'cycle-requirement-wrong-shift' ||
        (this.style.position === 'fixed' && this.style.width === '50px') ||
        this.getAttribute('aria-label') ===
          'Drag Grace Hopper to another sector'
          ? 50
          : 0;
      return {
        x,
        y: 0,
        left: x,
        top: 0,
        right: x + size,
        bottom: size,
        width: size,
        height: size,
        toJSON: () => ({}),
      };
    });
}

describe('moving assignments', () => {
  it('keeps volunteer presentation flat while its drag moves over one target', async () => {
    setupDragGeometry();
    const data = structuredClone(builderData);
    data.events[0].eventTimeBlocks[0].shifts[0].requirements.push({
      id: 'side',
      roleId: 'role-1',
      sectorName: 'Side',
      peopleNeeded: 1,
    });
    const formatName = vi.spyOn(volunteerName, 'formatVolunteerName');
    renderBuilder({ data });
    const grip = screen.getByTestId('volunteer-card-grip');
    fireEvent.pointerDown(grip, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(document, { clientX: 20, clientY: 10 });
    await waitFor(() =>
      expect(screen.getAllByTestId('volunteer-card')).toHaveLength(2),
    );
    fireEvent.pointerMove(document, { clientX: 120, clientY: 10 });
    await screen.findByText(
      /was moved over droppable area cycle-requirement:side/,
    );
    formatName.mockClear();
    fireEvent.pointerMove(document, { clientX: 121, clientY: 10 });
    fireEvent.pointerMove(document, { clientX: 122, clientY: 10 });
    fireEvent.pointerMove(document, { clientX: 123, clientY: 10 });
    expect(formatName).not.toHaveBeenCalled();
    fireEvent.pointerUp(document, { clientX: 123, clientY: 10 });
  });

  it('keeps picker work flat during movement over the same target', async () => {
    setupDragGeometry();
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
    const pickerRenders = vi.spyOn(picker, 'AssignmentPicker');
    renderBuilder({ data });
    const source = screen.getByRole('button', {
      name: 'Drag Grace Hopper to another sector',
    });
    fireEvent.pointerDown(source, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(document, { clientX: 20, clientY: 10 });
    await waitFor(() => expect(source).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.pointerMove(document, { clientX: 120, clientY: 10 });
    await screen.findByText(
      /was moved over droppable area cycle-requirement:side/,
    );
    pickerRenders.mockClear();
    fireEvent.pointerMove(document, { clientX: 121, clientY: 10 });
    fireEvent.pointerMove(document, { clientX: 122, clientY: 10 });
    fireEvent.pointerMove(document, { clientX: 123, clientY: 10 });
    expect(pickerRenders).not.toHaveBeenCalled();
    fireEvent.pointerUp(document, { clientX: 123, clientY: 10 });
  });

  it('moves a dragged assignment to another sector and renders it there', async () => {
    setupDragGeometry();
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
    const move = vi.fn();
    function Board() {
      const [board, setBoard] = useState(data);
      return (
        <CycleBuilder
          data={board}
          onPublish={vi.fn()}
          isPublishing={false}
          cycleId="cycle-1"
          ministryId="ministry-1"
          cycleStartDate="2026-08-01"
          cycleEndDate="2026-08-31"
          createAssignment={{ isPending: false, mutateAsync: vi.fn() }}
          deleteAssignment={{ isPending: false, mutateAsync: vi.fn() }}
          reassignAssignment={{ isPending: false, mutateAsync: vi.fn() }}
          moveAssignment={{
            isPending: false,
            mutateAsync: async (input) => {
              move(input);
              const next = structuredClone(board);
              next.events[0].eventTimeBlocks[0].shifts[0].assignments[0].shiftRequirementId =
                input.body.shiftRequirementId;
              next.assignments[0].shiftRequirementId =
                input.body.shiftRequirementId;
              setBoard(next);
            },
          }}
        />
      );
    }
    renderWithProviders(<Board />);
    const source = screen.getByRole('button', {
      name: 'Drag Grace Hopper to another sector',
    });
    fireEvent.pointerDown(source, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(document, { clientX: 20, clientY: 10 });
    await waitFor(() => expect(source).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.pointerMove(document, { clientX: 120, clientY: 10 });
    await screen.findByText(
      /was moved over droppable area cycle-requirement:side/,
    );
    fireEvent.pointerUp(document, { clientX: 120, clientY: 10 });
    await waitFor(() =>
      expect(move).toHaveBeenCalledWith({
        assignmentId: 'assignment-1',
        body: { shiftRequirementId: 'side' },
      }),
    );
    expect(
      within(screen.getByTestId('cycle-requirement-side')).getByText(
        'Grace Hopper',
      ),
    ).toBeVisible();
    expect(
      within(
        screen.getByTestId('cycle-requirement-requirement-role-1'),
      ).queryByText('Grace Hopper'),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['another role in the same Shift', 220],
    ['the same Role in another Shift', 320],
  ])('does not move onto %s', async (_description, destinationX) => {
    setupDragGeometry();
    const data = structuredClone(builderData);
    data.roles.push({ id: 'role-2', name: 'Helper' });
    const block = data.events[0].eventTimeBlocks[0];
    const shift = block.shifts[0];
    shift.requirements.push(
      { id: 'side', roleId: 'role-1', sectorName: 'Side', peopleNeeded: 1 },
      {
        id: 'wrong-role',
        roleId: 'role-2',
        sectorName: 'Other role',
        peopleNeeded: 1,
      },
    );
    shift.assignments.push(existingAssignment);
    data.assignments.push(existingAssignment);
    block.shifts.push({
      ...structuredClone(shift),
      shiftId: 'shift-2',
      assignments: [],
      requirements: [
        {
          id: 'wrong-shift',
          roleId: 'role-1',
          sectorName: 'Other shift',
          peopleNeeded: 1,
        },
      ],
    });
    const { move } = renderBuilder({ data });
    const source = screen.getByRole('button', {
      name: 'Drag Grace Hopper to another sector',
    });
    fireEvent.pointerDown(source, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(document, { clientX: 20, clientY: 10 });
    await waitFor(() => expect(source).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.pointerMove(document, { clientX: 120, clientY: 10 });
    await screen.findByText(
      /was moved over droppable area cycle-requirement:side/,
    );
    fireEvent.pointerMove(document, { clientX: destinationX, clientY: 10 });
    await screen.findByText(/is no longer over a droppable area/);
    fireEvent.pointerUp(document, { clientX: destinationX, clientY: 10 });
    expect(move).not.toHaveBeenCalled();
    expect(
      within(
        screen.getByTestId('cycle-requirement-requirement-role-1'),
      ).getByText('Grace Hopper'),
    ).toBeVisible();
  });

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
        screen.getByRole('button', {
          name: m.builder_ui_publish({}, { locale: 'en' }),
        }),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Audit log' }),
      ).not.toBeInTheDocument();
    } finally {
      parked.auditPanel = true;
    }
  });

  it('shows Send updates only when Volunteers have unsent changes', () => {
    const data = boardData({ state: 'published' });
    data.affectedVolunteerCount = 2;
    renderBuilder({ data });
    expect(
      screen.getByRole('button', {
        name: m.builder_send_updates({ count: 2 }),
      }),
    ).toBeVisible();
  });

  it('hides Send updates when there are no unsent changes', () => {
    const data = boardData({ state: 'published' });
    data.affectedVolunteerCount = 0;
    renderBuilder({ data });
    expect(
      screen.queryByRole('button', { name: /Send updates/ }),
    ).not.toBeInTheDocument();
  });

  it('summarizes empty places and affected Shifts before publishing', async () => {
    renderBuilder({ data: boardData({}) });
    await userEvent.click(
      screen.getByRole('button', { name: m.builder_ui_publish() }),
    );
    expect(
      screen.getByText(m.builder_ui_publish_gaps({ places: 1, shifts: 1 })),
    ).toBeVisible();
  });

  it('excludes cancelled Events from the publish confirmation', async () => {
    const data = boardData({});
    const event = data.events[0];
    if (!event) throw new Error('missing Event');
    data.events.push({
      ...event,
      eventId: 'cancelled-event',
      participationId: 'cancelled-participation',
      status: 'cancelled',
    });
    renderBuilder({ data });
    await userEvent.click(
      screen.getByRole('button', { name: m.builder_ui_publish() }),
    );
    expect(
      screen.getByText(m.builder_ui_publish_gaps({ places: 1, shifts: 1 })),
    ).toBeVisible();
  });

  it('hides Publish once published while retaining board affordances', () => {
    renderBuilder({
      data: boardData({
        start: '2026-08-01T12:00:00.000Z',
        state: 'published',
      }),
    });

    expect(
      screen.queryByRole('button', {
        name: m.builder_ui_publish({}, { locale: 'en' }),
      }),
    ).not.toBeInTheDocument();
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

describe('Swap requests on the board', () => {
  const request: LeaderSwapRequest = {
    id: 'request-1',
    assignmentId: 'assignment-1',
    volunteerName: 'Grace Hopper',
    eventTitle: 'Sunday Gathering',
    roleName: 'Greeter',
    sectorName: 'Main',
    startsAt: '2026-08-02T09:00:00.000Z',
    endsAt: '2026-08-02T11:00:00.000Z',
    note: 'Ada covers',
    raisedAt: '2026-08-01T10:00:00.000Z',
    status: 'open',
  };
  const data = boardData({ state: 'published' });

  it('keeps context-only consumers quiet on unrelated renders and updates them for swap changes', () => {
    const requests = [request];
    const onSelectSwapRequest = vi.fn();
    const mutateAsync = vi.fn();
    const mutation = { isPending: false, mutateAsync };
    const renderTree = (swapRequests: LeaderSwapRequest[]) => (
      <CycleBuilder
        data={data}
        onPublish={vi.fn()}
        isPublishing={false}
        cycleId="cycle-1"
        ministryId="ministry-1"
        createAssignment={mutation}
        deleteAssignment={mutation}
        reassignAssignment={mutation}
        swapRequests={swapRequests}
        onSelectSwapRequest={onSelectSwapRequest}
      />
    );
    swapContextConsumer.mockClear();
    const { rerender } = renderWithProviders(renderTree(requests));
    const count = swapContextConsumer.mock.calls.length;
    expect(count).toBeGreaterThan(0);
    expect(
      swapContextConsumer.mock.lastCall?.[0].openRequestByAssignment.get(
        'assignment-1',
      ),
    ).toBe('request-1');
    rerender(renderTree(requests));
    expect(swapContextConsumer).toHaveBeenCalledTimes(count);
    rerender(renderTree([{ ...request, status: 'expired' }]));
    expect(swapContextConsumer).toHaveBeenCalledTimes(count + 1);
    expect(
      swapContextConsumer.mock.lastCall?.[0].openRequestByAssignment.has(
        'assignment-1',
      ),
    ).toBe(false);
  });

  it('warns on an open request and opens its sheet from the warning', async () => {
    const onSelectSwapRequest = vi.fn();
    renderBuilder({ data, swapRequests: [request], onSelectSwapRequest });

    await userEvent.click(
      screen.getByRole('button', {
        name: m.swap_board_warning_label({ name: 'Grace Hopper' }),
      }),
    );

    expect(onSelectSwapRequest).toHaveBeenCalledWith('request-1');
  });

  it('shows no warning for an expired request', () => {
    renderBuilder({
      data,
      swapRequests: [{ ...request, status: 'expired' }],
    });

    expect(
      screen.queryByTestId('swap-request-warning'),
    ).not.toBeInTheDocument();
  });

  it('shows the request facts in the sheet', () => {
    renderBuilder({
      data,
      swapRequests: [request],
      selectedSwapRequestId: 'request-1',
    });

    const sheet = screen.getByTestId('swap-request-sheet');
    expect(within(sheet).getByText('Grace Hopper')).toBeVisible();
    expect(within(sheet).getByText(/Sunday Gathering/)).toBeVisible();
    expect(within(sheet).getByText('Main × Greeter')).toBeVisible();
    expect(within(sheet).getByText('Ada covers')).toBeVisible();
    expect(within(sheet).getByText(m.swap_board_status_open())).toBeVisible();
  });

  it('presents an expired request as Unanswered without any action', () => {
    renderBuilder({
      data,
      swapRequests: [{ ...request, status: 'expired' }],
      selectedSwapRequestId: 'request-1',
    });

    expect(screen.getByText(m.swap_board_status_expired())).toBeVisible();
    expect(screen.getByText(m.swap_board_expired_hint())).toBeVisible();
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).not.toContain(expect.stringMatching(/keep|cover/i));
  });

  it('Cover closes the sheet and opens the Assignment actions without answering the request', async () => {
    const keep = vi.spyOn(adminApi, 'keepSwapRequest');
    const onSelectSwapRequest = vi.fn();
    renderBuilder({
      data,
      swapRequests: [request],
      selectedSwapRequestId: 'request-1',
      onSelectSwapRequest,
    });

    await userEvent.click(
      screen.getByRole('button', { name: m.swap_board_cover() }),
    );

    expect(onSelectSwapRequest).toHaveBeenCalledWith(undefined);
    expect(await screen.findByTestId('assignment-picker')).toBeInTheDocument();
    expect(keep).not.toHaveBeenCalled();
  });

  describe('Keep them on', () => {
    const keepWith = (implementation: () => Promise<unknown>) =>
      vi
        .spyOn(adminApi, 'keepSwapRequest')
        .mockImplementation(implementation as never);

    it('sends the trimmed reply, then closes the sheet', async () => {
      const keep = keepWith(() => Promise.resolve(null));
      const onSelectSwapRequest = vi.fn();
      renderBuilder({
        data,
        swapRequests: [request],
        selectedSwapRequestId: 'request-1',
        onSelectSwapRequest,
      });

      await userEvent.type(
        screen.getByLabelText(m.swap_board_reply_label()),
        '  Stay with us  ',
      );
      await userEvent.click(
        screen.getByRole('button', { name: m.swap_board_keep() }),
      );

      await waitFor(() =>
        expect(onSelectSwapRequest).toHaveBeenCalledWith(undefined),
      );
      expect(keep).toHaveBeenCalledWith('ministry-1', 'request-1', {
        reply: 'Stay with us',
      });
    });

    it('sends no reply when it is blank', async () => {
      const keep = keepWith(() => Promise.resolve(null));
      renderBuilder({
        data,
        swapRequests: [request],
        selectedSwapRequestId: 'request-1',
      });

      await userEvent.type(
        screen.getByLabelText(m.swap_board_reply_label()),
        '   ',
      );
      await userEvent.click(
        screen.getByRole('button', { name: m.swap_board_keep() }),
      );

      await waitFor(() =>
        expect(keep).toHaveBeenCalledWith('ministry-1', 'request-1', {
          reply: undefined,
        }),
      );
    });

    it('recovers from a conflict with a no-longer-open message and closes the sheet', async () => {
      keepWith(() =>
        Promise.reject(
          new AxiosError('conflict', '409', undefined, undefined, {
            status: 409,
            data: {},
            statusText: 'Conflict',
            headers: {},
            config: { headers: new AxiosHeaders() },
          }),
        ),
      );
      const onSelectSwapRequest = vi.fn();
      renderBuilder({
        data,
        swapRequests: [request],
        selectedSwapRequestId: 'request-1',
        onSelectSwapRequest,
      });

      await userEvent.click(
        screen.getByRole('button', { name: m.swap_board_keep() }),
      );

      await waitFor(() =>
        expect(onSelectSwapRequest).toHaveBeenCalledWith(undefined),
      );
      expect(toast.error).toHaveBeenCalledWith(m.swap_board_keep_stale());
      expect(
        screen.queryByText(m.swap_board_keep_error()),
      ).not.toBeInTheDocument();
    });
  });
});
