import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { parseInstant, setTestClock } from '@church/time';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  beforeEach as beforeEachLocale,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CycleBuilderMatrix } from '@/features/scheduling/components/builder/board/cycle-builder-matrix';
import type {
  CycleBuilderAssignment,
  CycleBuilderData,
  CycleBuilderEligibleVolunteerSummary,
} from '@/features/scheduling/hooks/use-cycle-builder';
import * as ranking from '@/features/scheduling/utils/builder/cycle-builder-ranking.utils';
import { pickCalendarDate } from '@/tests/setup/date-picker';
import { renderWithProviders } from '@/tests/setup/render';

beforeEachLocale(() => {
  overwriteGetLocale(() => 'en');
  setTestClock({
    instant: parseInstant({ value: '2026-08-01T00:00:00.000Z' }),
  });
});

const boardData: CycleBuilderData = {
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
      peopleNeeded: 2,
      assignedCount: 0,
      eventTimeBlockCount: 1,
      eventTimeBlocks: [
        {
          eventTimeBlockId: 'event-time-block-1',
          label: 'Morning service',
          startTime: '2026-08-02T09:00:00.000Z',
          endTime: '2026-08-02T11:00:00.000Z',
          cancelled: false,
          included: true,
          peopleNeeded: 2,
          assignedCount: 0,
          shiftCount: 1,
          shifts: [
            {
              shiftId: 'shift-1',
              eventTimeBlockId: 'event-time-block-1',
              startTime: '2026-08-02T09:00:00.000Z',
              endTime: '2026-08-02T11:00:00.000Z',
              cancelled: false,
              peopleNeeded: 2,
              assignedCount: 0,
              requirements: [
                {
                  id: 'requirement-role-1',
                  roleId: 'role-1',
                  sectorName: 'Main',
                  peopleNeeded: 2,
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
                  qualifiedRoleIds: [],
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

const sameShiftAssignment: CycleBuilderAssignment = {
  id: 'assignment-1',
  churchId: 'church-1',
  eventTimeBlockId: 'event-time-block-1',
  shiftId: 'shift-1',
  volunteerId: 'volunteer-1',
  roleId: 'role-support',
  shiftRequirementId: 'requirement-role-support',
  status: 'pending',
  assignedAt: '2026-08-01T09:00:00.000Z',
  lateMark: false,
  volunteerName: 'Local Volunteer',
};

function boardDataWithShiftAssignments(): CycleBuilderData {
  const event = boardData.events[0];
  const eventTimeBlock = event?.eventTimeBlocks[0];
  const morningShift = eventTimeBlock?.shifts[0];

  if (!(event && eventTimeBlock && morningShift)) {
    throw new Error('Board fixture is incomplete');
  }

  // Both are qualified for both roles: this fixture is about *where someone is
  // already serving*, and since B-2 an unqualified volunteer is no longer
  // recommended at all — which would hide the very distinction under test.
  const eligibleVolunteers: CycleBuilderEligibleVolunteerSummary[] = [
    {
      volunteerId: 'volunteer-1',
      volunteerName: 'Local Volunteer',
      answerState: 'available',
      conflict: null,
      qualifiedRoleIds: ['role-support', 'role-coordinator'],
      ministryAccessLevel: 'volunteer',
    },
    {
      volunteerId: 'volunteer-2',
      volunteerName: 'Available Volunteer',
      answerState: 'available',
      conflict: null,
      qualifiedRoleIds: ['role-support', 'role-coordinator'],
      ministryAccessLevel: 'volunteer',
    },
  ];

  return {
    ...boardData,
    assignments: [sameShiftAssignment],
    roles: [
      { id: 'role-support', name: 'Support' },
      { id: 'role-coordinator', name: 'Coordinator' },
    ],
    events: [
      {
        ...event,
        peopleNeeded: 3,
        assignedCount: 1,
        eventTimeBlocks: [
          {
            ...eventTimeBlock,
            peopleNeeded: 3,
            assignedCount: 1,
            shiftCount: 2,
            shifts: [
              {
                ...morningShift,
                label: 'Morning',
                peopleNeeded: 2,
                assignedCount: 1,
                requirements: [
                  {
                    id: 'requirement-role-support',
                    roleId: 'role-support',
                    sectorName: 'Main',
                    peopleNeeded: 1,
                  },
                  {
                    id: 'requirement-role-coordinator',
                    roleId: 'role-coordinator',
                    sectorName: 'Main',
                    peopleNeeded: 1,
                  },
                ],
                assignments: [sameShiftAssignment],
                eligibleVolunteerCount: eligibleVolunteers.length,
                eligibleVolunteers,
              },
              {
                ...morningShift,
                shiftId: 'shift-2',
                label: 'Evening',
                startTime: '2026-08-02T17:00:00.000Z',
                endTime: '2026-08-02T19:00:00.000Z',
                peopleNeeded: 1,
                assignedCount: 0,
                requirements: [
                  {
                    id: 'requirement-evening-coordinator',
                    roleId: 'role-coordinator',
                    sectorName: 'Main',
                    peopleNeeded: 1,
                  },
                ],
                assignments: [],
                eligibleVolunteerCount: eligibleVolunteers.length,
                eligibleVolunteers,
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('CycleBuilderMatrix', () => {
  it('does not rerank focused volunteers when unrelated board controls change', () => {
    const rank = vi.spyOn(ranking, 'rankVolunteersForShiftRole');
    renderWithProviders(
      <CycleBuilderMatrix data={boardData} {...refreshProps} />,
    );
    fireEvent.click(
      screen.getByTestId('cycle-requirement-focus-requirement-role-1'),
    );
    expect(rank).toHaveBeenCalled();
    rank.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /date filters/i }));
    expect(rank).not.toHaveBeenCalled();
    rank.mockRestore();
  });

  it('shares one expiry timer across cells and clears it on unmount', () => {
    const intervals = vi.spyOn(window, 'setInterval');
    const clears = vi.spyOn(window, 'clearInterval');
    const { unmount } = renderWithProviders(
      <CycleBuilderMatrix
        data={boardDataWithShiftAssignments()}
        {...refreshProps}
      />,
    );
    const expiryCalls = intervals.mock.calls.filter(
      ([, delay]) => delay === 30_000,
    );
    expect(expiryCalls).toHaveLength(1);
    const timer =
      intervals.mock.results[intervals.mock.calls.indexOf(expiryCalls[0])]
        ?.value;
    unmount();
    expect(clears).toHaveBeenCalledWith(timer);
    intervals.mockRestore();
    clears.mockRestore();
  });

  it('keeps same-role Sector cells independent and selects the requirement id', async () => {
    const user = userEvent.setup();
    const onSelectAssignment = vi.fn();
    const onRemoveAssignment = vi.fn();
    const event = boardData.events[0];
    const timeBlock = event?.eventTimeBlocks[0];
    const shift = timeBlock?.shifts[0];
    if (!(event && timeBlock && shift))
      throw new Error('Board fixture is incomplete');
    const assigned: CycleBuilderAssignment = {
      ...sameShiftAssignment,
      shiftRequirementId: 'babies-requirement',
    };
    const requirements = [
      {
        id: 'babies-requirement',
        roleId: 'role-1',
        sectorName: 'Babies Room',
        peopleNeeded: 1,
      },
      {
        id: 'kids-requirement',
        roleId: 'role-1',
        sectorName: 'Kids Room',
        peopleNeeded: 2,
      },
    ];
    const data: CycleBuilderData = {
      ...boardData,
      assignments: [assigned],
      events: [
        {
          ...event,
          eventTimeBlocks: [
            {
              ...timeBlock,
              shifts: [
                {
                  ...shift,
                  requirements,
                  assignments: [assigned],
                  eligibleVolunteers: [
                    {
                      volunteerId: 'volunteer-2',
                      volunteerName: 'Available Volunteer',
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
    renderWithProviders(
      <CycleBuilderMatrix
        data={data}
        selectedDates={['2026-08-02']}
        onSelectedDatesChange={vi.fn()}
        onSelectVolunteer={vi.fn()}
        onSelectAssignment={onSelectAssignment}
        onRemoveAssignment={onRemoveAssignment}
      />,
    );

    const babiesCell = screen.getByTestId(
      'cycle-requirement-babies-requirement',
    );
    const kidsCell = screen.getByTestId('cycle-requirement-kids-requirement');
    expect(within(babiesCell).getByText('1/1')).toBeVisible();
    expect(within(kidsCell).getByText('0/2')).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Babies Room' })).getByText(
        'Greeter',
      ),
    ).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Kids Room' })).getByText(
        'Greeter',
      ),
    ).toBeVisible();
    expect(screen.getByTestId('cycle-shift-footer-shift-1')).toHaveTextContent(
      '2 empty',
    );

    await user.click(within(kidsCell).getByRole('button', { name: 'Add' }));
    await user.click(
      within(await screen.findByTestId('assignment-picker')).getByText(
        'Available Volunteer',
      ),
    );
    expect(onSelectAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        shiftId: 'shift-1',
        shiftRequirementId: 'kids-requirement',
        roleId: 'role-1',
        volunteerId: 'volunteer-2',
      }),
    );
    expect(
      screen.getByTestId('cycle-requirement-focus-kids-requirement'),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByTestId('cycle-requirement-focus-babies-requirement'),
    ).toHaveAttribute('aria-pressed', 'false');
    await user.click(within(babiesCell).getByText('Local Volunteer'));
    await user.click(
      within(await screen.findByTestId('assignment-picker')).getByText(
        'Available Volunteer',
      ),
    );
    expect(onSelectAssignment).toHaveBeenLastCalledWith(
      expect.objectContaining({
        assignmentId: assigned.id,
        shiftRequirementId: 'babies-requirement',
        volunteerId: 'volunteer-2',
      }),
    );
    await user.click(within(babiesCell).getByText('Local Volunteer'));
    await user.click(screen.getByRole('button', { name: 'Unassign' }));
    expect(onRemoveAssignment).toHaveBeenCalledWith(assigned.id);
    expect(within(kidsCell).getByText('0/2')).toBeVisible();
  });

  it('keeps distinct Sectors with the same name separate', () => {
    const data = boardDataWithShiftAssignments();
    const event = data.events[0];
    const block = event.eventTimeBlocks[0];
    const shift = block.shifts[0];
    const requirements = shift.requirements.map((requirement, index) => ({
      ...requirement,
      sectorId: `sector-${index}`,
    }));
    renderWithProviders(
      <CycleBuilderMatrix
        data={{
          ...data,
          events: [
            {
              ...event,
              eventTimeBlocks: [
                { ...block, shifts: [{ ...shift, requirements }] },
              ],
            },
          ],
        }}
        selectedDates={['2026-08-02']}
        onSelectedDatesChange={vi.fn()}
        onSelectVolunteer={vi.fn()}
        onSelectAssignment={vi.fn()}
        onRemoveAssignment={vi.fn()}
      />,
    );
    const sectors = screen.getAllByRole('group', { name: 'Main' });
    expect(sectors).toHaveLength(2);
    const [firstSector, secondSector] = sectors;
    if (!(firstSector && secondSector)) throw new Error('Sectors are missing');
    expect(within(firstSector).getByText('Support')).toBeVisible();
    expect(within(secondSector).getByText('Coordinator')).toBeVisible();
  });

  it('updates the shift footer when assignments are added and removed', () => {
    const data = boardDataWithShiftAssignments();
    const event = data.events[0];
    const block = event.eventTimeBlocks[0];
    const shift = block.shifts[0];
    const renderBoard = (assignments: CycleBuilderAssignment[]) => (
      <CycleBuilderMatrix
        data={{
          ...data,
          events: [
            {
              ...event,
              eventTimeBlocks: [
                { ...block, shifts: [{ ...shift, assignments }] },
              ],
            },
          ],
        }}
        selectedDates={['2026-08-02']}
        onSelectedDatesChange={vi.fn()}
        onSelectVolunteer={vi.fn()}
        onSelectAssignment={vi.fn()}
        onRemoveAssignment={vi.fn()}
      />
    );
    const { rerender } = renderWithProviders(
      renderBoard([sameShiftAssignment]),
    );
    expect(screen.getByTestId('cycle-shift-footer-shift-1')).toHaveTextContent(
      '1 empty',
    );
    const secondAssignment = {
      ...sameShiftAssignment,
      id: 'assignment-2',
      shiftRequirementId: 'requirement-role-coordinator',
    };
    rerender(renderBoard([sameShiftAssignment, secondAssignment]));
    expect(screen.getByTestId('cycle-shift-footer-shift-1')).toHaveTextContent(
      'Full',
    );
    rerender(renderBoard([secondAssignment]));
    expect(screen.getByTestId('cycle-shift-footer-shift-1')).toHaveTextContent(
      '1 empty',
    );
    overwriteGetLocale(() => 'pt-BR');
    try {
      rerender(renderBoard([secondAssignment]));
      expect(
        screen.getByTestId('cycle-shift-footer-shift-1'),
      ).toHaveTextContent(m.builder_ui_empty_one());
      rerender(renderBoard([sameShiftAssignment, secondAssignment]));
      expect(
        screen.getByTestId('cycle-shift-footer-shift-1'),
      ).toHaveTextContent(m.builder_ui_full());
      rerender(renderBoard([]));
      expect(
        screen.getByTestId('cycle-shift-footer-shift-1'),
      ).toHaveTextContent(m.builder_ui_empty_many({ count: 2 }));
    } finally {
      overwriteGetLocale(() => 'en');
    }
  });

  it.each([
    ['time block', 'block'],
    ['Event', 'event'],
  ] as const)('shows a cancelled %s as Cancelled with no way to staff it', async (_, scope) => {
    const user = userEvent.setup();
    const event = boardData.events[0];
    const block = event.eventTimeBlocks[0];
    const cancelledShifts = block.shifts.map((shift) => ({
      ...shift,
      cancelled: true,
    }));
    renderWithProviders(
      <CycleBuilderMatrix
        data={{
          ...boardData,
          events: [
            {
              ...event,
              status: scope === 'event' ? 'cancelled' : event.status,
              eventTimeBlocks: [
                { ...block, cancelled: true, shifts: cancelledShifts },
              ],
            },
          ],
        }}
        selectedDates={['2026-08-02']}
        onSelectedDatesChange={vi.fn()}
        onSelectVolunteer={vi.fn()}
        onSelectAssignment={vi.fn()}
        onRemoveAssignment={vi.fn()}
      />,
    );
    expect(screen.getAllByText(m.event_status_cancelled())).toHaveLength(1);
    const percent = screen.queryByTestId(
      'cycle-event-staffing-percent-event-1',
    );
    if (scope === 'event') expect(percent).not.toBeInTheDocument();
    else expect(percent).toHaveTextContent('0%');
    expect(
      screen.queryByTestId('cycle-shift-footer-shift-1'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: m.builder_ui_add() }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByTestId('cycle-requirement-focus-requirement-role-1'),
    );
    expect(
      screen.queryByRole('button', {
        name: new RegExp(m.builder_ui_pick_me()),
      }),
    ).not.toBeInTheDocument();
  });

  it('excludes same-shift assignees and warns when they serve in another shift', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CycleBuilderMatrix
        data={boardDataWithShiftAssignments()}
        selectedDates={['2026-08-02']}
        onSelectedDatesChange={vi.fn()}
        onSelectVolunteer={vi.fn()}
        onSelectAssignment={vi.fn()}
        onRemoveAssignment={vi.fn()}
      />,
    );

    const morningGroup = screen.getAllByRole('group', { name: 'Main' })[0];
    if (!morningGroup) throw new Error('Morning Sector is missing');
    expect(within(morningGroup).getByText('Support')).toBeVisible();
    expect(within(morningGroup).getByText('Coordinator')).toBeVisible();
    expect(screen.queryByText(/\bteam\b/i)).not.toBeInTheDocument();

    const addButtons = screen.getAllByRole('button', { name: 'Add' });
    await user.click(addButtons[0]);

    const morningPicker = screen.getByTestId('assignment-picker');
    expect(
      within(morningPicker).queryByText('Local Volunteer'),
    ).not.toBeInTheDocument();

    await user.click(addButtons[1]);

    const eveningPicker = screen.getByTestId('assignment-picker');
    expect(within(eveningPicker).getByText('Local Volunteer')).toBeVisible();
    expect(
      within(eveningPicker).getByText(/Serving .*Morning.*Support/),
    ).toBeVisible();
    expect(
      within(eveningPicker)
        .getAllByTestId('suggestion-option')
        .some((option) => option.textContent?.includes('Local Volunteer')),
    ).toBe(true);
  });

  it('renders each date as a compact event, time block, shift, and role column', () => {
    renderWithProviders(
      <CycleBuilderMatrix
        data={boardData}
        selectedDates={['2026-08-02']}
        onSelectedDatesChange={vi.fn()}
        onSelectVolunteer={vi.fn()}
        onSelectAssignment={vi.fn()}
        onRemoveAssignment={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Sunday Gathering' }),
    ).toBeVisible();
    expect(
      screen.getByTestId('cycle-event-staffing-percent-event-1'),
    ).toHaveClass('text-destructive');
    expect(screen.getByText(/Morning service/)).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Main' })).getByText('Greeter'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: /split|edit shift|headcount/i }),
    ).not.toBeInTheDocument();
  });

  it('independently stacks each date column without empty matrix cells', () => {
    renderWithProviders(
      <CycleBuilderMatrix
        data={{
          ...boardData,
          events: [
            ...boardData.events,
            {
              ...boardData.events[0],
              eventId: 'event-2',
              participationId: 'participation-2',
              title: 'Midweek Gathering',
              start: '2026-08-05T19:00:00.000Z',
              end: '2026-08-05T21:00:00.000Z',
              eventTimeBlocks: [],
            },
          ],
        }}
        selectedDates={[]}
        onSelectedDatesChange={vi.fn()}
        onSelectVolunteer={vi.fn()}
        onSelectAssignment={vi.fn()}
        onRemoveAssignment={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Sunday Gathering' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Midweek Gathering' }),
    ).toBeVisible();
    expect(screen.queryByText('Not part of this date')).not.toBeInTheDocument();
    expect(
      screen
        .getByTestId('cycle-board-drag-surface')
        .querySelector('.grid.items-start'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Scroll to earlier dates' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Scroll to later dates' }),
    ).not.toBeInTheDocument();

    const boardSurface = screen.getByTestId('cycle-board-drag-surface');
    const boardCard = screen
      .getByTestId('cycle-board-scroll')
      .closest('[data-slot="card"]');

    expect(boardCard).toBe(boardSurface);
    expect(boardCard).toHaveClass('py-0');
    expect(boardCard?.parentElement).toHaveClass('items-stretch');
    expect(boardCard?.querySelector('[data-slot="card-content"]')).toHaveClass(
      'workspace-panel',
    );
    expect(screen.getByTestId('cycle-board-viewport')).not.toHaveClass('pb-3');
    expect(boardSurface.querySelector('.min-w-\\[960px\\]')).not.toHaveClass(
      'px-2',
      'pb-2',
    );
  });

  it('lets leaders drag the date columns', () => {
    renderWithProviders(
      <CycleBuilderMatrix
        data={boardData}
        selectedDates={[]}
        onSelectedDatesChange={vi.fn()}
        onSelectVolunteer={vi.fn()}
        onSelectAssignment={vi.fn()}
        onRemoveAssignment={vi.fn()}
      />,
    );

    const viewport = screen.getByTestId('cycle-board-viewport');
    const dragSurface = screen.getByTestId('cycle-board-drag-surface');
    fireEvent.pointerDown(dragSurface, {
      pointerId: 1,
      clientX: 200,
      buttons: 1,
    });
    fireEvent.pointerMove(dragSurface, {
      pointerId: 1,
      clientX: 100,
      buttons: 1,
    });

    expect(viewport.scrollLeft).toBe(100);
    expect(dragSurface).toHaveClass('select-none');

    fireEvent.pointerUp(dragSurface, { pointerId: 1 });
    expect(dragSurface).not.toHaveClass('select-none');
  });

  it('keeps selection disabled while panning at a horizontal boundary', () => {
    renderWithProviders(
      <CycleBuilderMatrix
        data={boardData}
        selectedDates={[]}
        onSelectedDatesChange={vi.fn()}
        onSelectVolunteer={vi.fn()}
        onSelectAssignment={vi.fn()}
        onRemoveAssignment={vi.fn()}
      />,
    );

    const dragSurface = screen.getByTestId('cycle-board-drag-surface');
    fireEvent.pointerDown(dragSurface, {
      pointerId: 1,
      clientX: 100,
      buttons: 1,
    });
    fireEvent.pointerMove(dragSurface, {
      pointerId: 1,
      clientX: 200,
      buttons: 1,
    });

    expect(dragSurface).toHaveClass('select-none');

    fireEvent.pointerCancel(dragSurface, { pointerId: 1 });
    expect(dragSurface).not.toHaveClass('select-none');
  });

  it('does not turn assignment controls into a board-pan gesture', () => {
    renderWithProviders(
      <CycleBuilderMatrix
        data={boardData}
        selectedDates={[]}
        onSelectedDatesChange={vi.fn()}
        onSelectVolunteer={vi.fn()}
        onSelectAssignment={vi.fn()}
        onRemoveAssignment={vi.fn()}
      />,
    );

    const viewport = screen.getByTestId('cycle-board-viewport');
    const assignmentControl = screen.getByRole('button', { name: 'Add' });
    fireEvent.pointerDown(assignmentControl, {
      pointerId: 1,
      clientX: 200,
      buttons: 1,
    });
    fireEvent.pointerMove(assignmentControl, {
      pointerId: 1,
      clientX: 100,
      buttons: 1,
    });

    expect(viewport.scrollLeft).toBe(0);
  });

  it('scrolls the date columns freely, with no snap lanes', () => {
    renderWithProviders(
      <CycleBuilderMatrix
        data={boardData}
        selectedDates={[]}
        onSelectedDatesChange={vi.fn()}
        onSelectVolunteer={vi.fn()}
        onSelectAssignment={vi.fn()}
        onRemoveAssignment={vi.fn()}
      />,
    );

    const viewport = screen.getByTestId('cycle-board-viewport');
    expect(viewport.className).not.toMatch(/snap|scroll-px/);
    expect(viewport.querySelector('section[class*="snap"]')).toBeNull();
  });

  it('brings a keyboard-focused control into view without leaving the column half-cut', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderWithProviders(
      <CycleBuilderMatrix
        data={boardData}
        selectedDates={[]}
        onSelectedDatesChange={vi.fn()}
        onSelectVolunteer={vi.fn()}
        onSelectAssignment={vi.fn()}
        onRemoveAssignment={vi.fn()}
      />,
    );

    const add = screen.getByRole('button', { name: 'Add' });
    const matches = vi.spyOn(add, 'matches');

    // A mouse-click focus must not scroll: it would move the click target.
    matches.mockReturnValue(false);
    act(() => add.focus());
    expect(scrollIntoView).not.toHaveBeenCalled();

    matches.mockReturnValue(true);
    act(() => {
      add.blur();
      add.focus();
    });
    expect(scrollIntoView).toHaveBeenCalledWith({
      inline: 'nearest',
      block: 'nearest',
    });
  });

  describe('filter row', () => {
    /** Opens the "Date filters" disclosure that holds the range + weekday controls. */
    const openDateFilters = async () => {
      const user = userEvent.setup();
      await user.click(screen.getByTestId('cycle-builder-date-filters'));
    };

    it('groups the date-mode, range, search, and weekday-repeat controls under distinct labels', async () => {
      const secondSunday: CycleBuilderData['events'][number] = {
        ...boardData.events[0],
        eventId: 'event-2',
        participationId: 'participation-2',
        title: 'Second Sunday Gathering',
        start: '2026-08-09T09:00:00.000Z',
        end: '2026-08-09T11:00:00.000Z',
      };

      renderWithProviders(
        <CycleBuilderMatrix
          data={{ ...boardData, events: [boardData.events[0], secondSunday] }}
          selectedDates={[]}
          onSelectedDatesChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      expect(screen.getByText('Show')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Event dates' })).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'All cycle dates' }),
      ).toBeVisible();
      expect(screen.getByLabelText('Search events')).toBeVisible();

      // The date-shaped filters live behind one disclosure (B-4) — eight
      // controls in a single wrapping row was over the working-memory limit.
      await openDateFilters();

      expect(screen.getByLabelText('From')).toBeVisible();
      expect(screen.getByLabelText('To')).toBeVisible();
      // base-ui's Select mirrors the matching item's label into the trigger
      // only after the popup registers it (on first open in jsdom), so at
      // rest the trigger shows the raw value — assert case-insensitively.
      expect(
        screen.getByTestId('cycle-builder-date-span-mode'),
      ).toHaveTextContent(/starts/i);
      // Both seeded events fall on a Sunday, so the repeated-weekday quick
      // filter should surface exactly that day.
      expect(screen.getByText('Repeats on')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Sundays' })).toBeVisible();
    });

    it('keeps the always-on row to search plus Show, and folds the date filters behind one disclosure (B-4)', async () => {
      const secondSunday: CycleBuilderData['events'][number] = {
        ...boardData.events[0],
        eventId: 'event-2',
        participationId: 'participation-2',
        title: 'Second Sunday Gathering',
        start: '2026-08-09T09:00:00.000Z',
        end: '2026-08-09T11:00:00.000Z',
      };

      renderWithProviders(
        <CycleBuilderMatrix
          data={{ ...boardData, events: [boardData.events[0], secondSunday] }}
          selectedDates={[]}
          onSelectedDatesChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      // Collapsed: the row carries two filter clusters and the disclosure, so
      // the leader reads three decisions, not eight.
      expect(
        screen.getAllByText(/^(Search events|Date range|Show|Repeats on)$/),
      ).toHaveLength(2);
      expect(screen.queryByLabelText('From')).not.toBeInTheDocument();
      expect(screen.queryByText('Repeats on')).not.toBeInTheDocument();

      await openDateFilters();

      const labelTexts = screen
        .getAllByText(/^(Search events|Date range|Show|Repeats on)$/)
        .map((node) => node.textContent);

      expect(labelTexts).toEqual([
        'Search events',
        'Show',
        'Date range',
        'Repeats on',
      ]);
    });

    it('counts the date filters that are on, so a folded-away filter still announces itself (B-4)', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <CycleBuilderMatrix
          data={boardData}
          selectedDates={[]}
          onSelectedDatesChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      const trigger = screen.getByTestId('cycle-builder-date-filters');
      expect(trigger).toHaveTextContent(/^Date filters$/);

      await user.click(trigger);
      await user.click(screen.getByTestId('cycle-builder-date-span-mode'));
      await user.click(await screen.findByRole('option', { name: 'Ends' }));

      expect(trigger).toHaveTextContent('1');
    });

    it('names the toggle clusters as groups rather than orphan labels (B-3)', async () => {
      const secondSunday: CycleBuilderData['events'][number] = {
        ...boardData.events[0],
        eventId: 'event-2',
        participationId: 'participation-2',
        title: 'Second Sunday Gathering',
        start: '2026-08-09T09:00:00.000Z',
        end: '2026-08-09T11:00:00.000Z',
      };

      renderWithProviders(
        <CycleBuilderMatrix
          data={{ ...boardData, events: [boardData.events[0], secondSunday] }}
          selectedDates={[]}
          onSelectedDatesChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      await openDateFilters();

      // "Show" and "Repeats on" were <label>s owning no control — announced
      // with nothing attached to them. They name a group of toggles.
      expect(screen.getByText('Show').tagName).toBe('LEGEND');
      expect(screen.getByText('Repeats on').tagName).toBe('LEGEND');
      expect(screen.getByRole('group', { name: 'Show' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Event dates' }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Sundays' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('does not render the repeated-weekday cluster when no weekday repeats', async () => {
      renderWithProviders(
        <CycleBuilderMatrix
          data={boardData}
          selectedDates={[]}
          onSelectedDatesChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      await openDateFilters();

      expect(screen.queryByText('Repeats on')).not.toBeInTheDocument();
    });

    it('sizes the search input the same as the filter buttons instead of a hardcoded mismatch', () => {
      renderWithProviders(
        <CycleBuilderMatrix
          data={boardData}
          selectedDates={[]}
          onSelectedDatesChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      const search = screen.getByLabelText('Search events');
      const modeButton = screen.getByRole('button', { name: 'Event dates' });
      // jsdom's `matchMedia` stub (see tests/setup/component.ts) makes
      // `useMediaQuery('(max-width: 767px)')` resolve true, so this panel
      // renders under the touch form-control size here — both controls
      // should resolve to that same height. Previously the search input
      // hardcoded h-8 and the buttons hardcoded size="sm" (h-7), so neither
      // followed the surrounding `FormControlSizeProvider` at all.
      expect(search).toHaveClass('h-11');
      expect(modeButton).toHaveClass('h-11');
    });

    it('pins the clear chip outside the draggable date rail: inert "All" until a day is selected', () => {
      const { rerender } = renderWithProviders(
        <CycleBuilderMatrix
          data={boardData}
          selectedDates={[]}
          onSelectedDatesChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      // Inert but still a focusable button announcing the current state.
      const clearChip = screen.getByTestId('cycle-date-strip-clear');
      expect(clearChip.tagName).toBe('BUTTON');
      expect(clearChip).toHaveAttribute('aria-disabled', 'true');
      expect(clearChip).toHaveAccessibleName('Showing all dates');
      expect(clearChip).toHaveTextContent('All');
      // The pan handlers live on the "Cycle dates" group; the clear chip
      // sits outside it so a pan gesture can never swallow it.
      expect(
        clearChip.closest('[role="group"][aria-label="Cycle dates"]'),
      ).toBeNull();

      rerender(
        <CycleBuilderMatrix
          data={boardData}
          selectedDates={['2026-08-02']}
          onSelectedDatesChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      // The same element, so focus never falls to the page when it clears.
      expect(screen.getByTestId('cycle-date-strip-clear')).toBe(clearChip);
      expect(clearChip).toHaveAttribute('aria-disabled', 'false');
      expect(clearChip).toHaveAccessibleName('Clear 1 selected day');
      expect(clearChip).toHaveTextContent('1 day');
    });

    it('no longer renders "All dates" inside the filter row itself', () => {
      renderWithProviders(
        <CycleBuilderMatrix
          data={boardData}
          selectedDates={['2026-08-02']}
          onSelectedDatesChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      const clearFiltersButton = screen.getByRole('button', {
        name: 'Clear filters',
      });
      const allDatesButton = screen.getByTestId('cycle-date-strip-clear');
      expect(clearFiltersButton.closest('section')).not.toBe(
        allDatesButton.closest('section'),
      );
    });

    it('"Clear filters" is disabled at defaults, enables once dirtied, and resets the search input', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <CycleBuilderMatrix
          data={boardData}
          selectedDates={[]}
          onSelectedDatesChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      const clearButton = screen.getByRole('button', { name: 'Clear filters' });
      expect(clearButton).toBeDisabled();

      const search = screen.getByLabelText('Search events');
      await user.type(search, 'gathering');
      expect(clearButton).not.toBeDisabled();

      await user.click(clearButton);
      expect(search).toHaveValue('');
      expect(clearButton).toBeDisabled();
    });

    it('filters events by span under "Ends" mode instead of the raw column date', async () => {
      const user = userEvent.setup();
      const earlyEvent: CycleBuilderData['events'][number] = {
        ...boardData.events[0],
        eventId: 'event-early',
        participationId: 'participation-early',
        title: 'Early Retreat',
        start: '2026-08-01T09:00:00.000Z',
        end: '2026-08-03T11:00:00.000Z',
      };
      const lateEvent: CycleBuilderData['events'][number] = {
        ...boardData.events[0],
        eventId: 'event-late',
        participationId: 'participation-late',
        title: 'Late Retreat',
        start: '2026-08-10T09:00:00.000Z',
        end: '2026-08-12T11:00:00.000Z',
      };

      renderWithProviders(
        <CycleBuilderMatrix
          data={{ ...boardData, events: [earlyEvent, lateEvent] }}
          selectedDates={[]}
          onSelectedDatesChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      // Each event spans multiple days, so it renders one heading per
      // visible date column — assert presence by count rather than a
      // single `getByRole`, which throws on more than one match.
      expect(
        screen.getAllByRole('heading', { name: 'Early Retreat' }).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByRole('heading', { name: 'Late Retreat' }).length,
      ).toBeGreaterThan(0);

      await user.click(screen.getByTestId('cycle-builder-date-filters'));
      await user.click(screen.getByTestId('cycle-builder-date-span-mode'));
      await user.click(await screen.findByRole('option', { name: 'Ends' }));

      const rangeStart = screen.getByLabelText('From');
      // "To" already defaults to the derived cycle end (Aug 12th, the last
      // event day) via the mount-time effect, and now that DatePickerField
      // disables out-of-range days, that's also the latest value it could
      // hold — leave it as-is and only move "From" up to Aug 11th.
      overwriteGetLocale(() => 'pt-BR');
      await pickCalendarDate({ user, trigger: rangeStart, date: '2026-08-11' });
      overwriteGetLocale(() => 'en');

      // "Early Retreat" ends Aug 3rd — outside [Aug 11, Aug 12] — so it drops
      // out even though its raw column dates (Aug 1-3) never touch the
      // range. "Late Retreat" ends Aug 12th, inside the range, so it stays.
      expect(
        screen.queryAllByRole('heading', { name: 'Early Retreat' }),
      ).toHaveLength(0);
      expect(
        screen.getAllByRole('heading', { name: 'Late Retreat' }).length,
      ).toBeGreaterThan(0);
    });
  });

  describe('date strip', () => {
    const SUNDAYS = ['2026-08-02', '2026-08-09', '2026-08-16', '2026-08-23'];

    /** One single-block event per Sunday in August, each its own column. */
    function sundaysData(): CycleBuilderData {
      return {
        ...boardData,
        events: SUNDAYS.map((day, index) => ({
          ...boardData.events[0],
          eventId: `event-${day}`,
          participationId: `participation-${day}`,
          title: `Service ${index + 1}`,
          start: `${day}T09:00:00.000Z`,
          end: `${day}T11:00:00.000Z`,
          eventTimeBlockCount: 0,
          eventTimeBlocks: [],
        })),
      };
    }

    interface HarnessProps {
      initial?: string[];
      onChange?: (dates: string[]) => void;
    }

    /** Owns the selection like the route's `?days=` does. */
    function Harness({ initial = [], onChange }: HarnessProps) {
      const [selectedDates, setSelectedDates] = useState(initial);
      return (
        <CycleBuilderMatrix
          data={sundaysData()}
          selectedDates={selectedDates}
          onSelectedDatesChange={(next) => {
            onChange?.(next);
            setSelectedDates(next);
          }}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />
      );
    }

    const rail = () =>
      within(screen.getByRole('group', { name: 'Cycle dates' }));
    const chip = (dayMonth: string) =>
      rail().getByRole('button', { name: new RegExp(`, ${dayMonth},`) });
    const pressedDays = () =>
      rail()
        .getAllByTestId('cycle-date-chip')
        .filter((button) => button.getAttribute('aria-pressed') === 'true')
        .map((button) => button.dataset.date);
    const boardColumns = () =>
      within(screen.getByTestId('cycle-board-scroll'))
        .queryAllByText(/^Sun, \d{2}\/08$/)
        .filter((element) => element.tagName === 'P')
        .map((element) => element.textContent);

    it('keeps the rail within 48px: chips over a thin scrollbar lane', () => {
      renderWithProviders(<Harness />);

      // The horizontal ScrollBar overlays the root's bottom edge; the
      // padding is its lane, so it never sits on a chip and eats clicks.
      // jsdom renders the touch size: a 4px lane under 44px chips.
      expect(screen.getByTestId('cycle-date-strip-scroll')).toHaveClass('pb-1');
      expect(screen.getByTestId('cycle-board-scroll')).toHaveClass('pb-3');
      for (const button of rail().getAllByTestId('cycle-date-chip')) {
        expect(button).toHaveClass('h-11'); // jsdom renders the touch size
      }
      expect(screen.getByTestId('cycle-date-strip-clear')).toHaveClass('w-24');
    });

    it('toggles a day with a plain click under a stable accessible name', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Harness />);
      const sunday = chip('09/08');
      expect(sunday).toHaveAccessibleName('Sun, 09/08, 0% staffed, 1 event');
      expect(sunday).toHaveAttribute('aria-pressed', 'false');

      await user.click(sunday);
      expect(sunday).toHaveAttribute('aria-pressed', 'true');
      expect(sunday).toHaveAccessibleName('Sun, 09/08, 0% staffed, 1 event');
      expect(boardColumns()).toEqual(['Sun, 09/08']);

      await user.click(chip('23/08'));
      // Date order, not click order.
      expect(boardColumns()).toEqual(['Sun, 09/08', 'Sun, 23/08']);
      expect(screen.getByText('2 of 4 dates visible')).toBeVisible();

      await user.click(sunday);
      expect(sunday).toHaveAttribute('aria-pressed', 'false');
      expect(boardColumns()).toEqual(['Sun, 23/08']);
    });

    it('selects a range from the last toggled chip with Shift+click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Harness />);

      await user.click(chip('23/08'));
      await user.keyboard('{Shift>}');
      await user.click(chip('09/08'));
      await user.keyboard('{/Shift}');

      expect(pressedDays()).toEqual(['2026-08-09', '2026-08-16', '2026-08-23']);
      expect(boardColumns()).toEqual([
        'Sun, 09/08',
        'Sun, 16/08',
        'Sun, 23/08',
      ]);
    });

    it('treats Shift+click with nothing toggled yet as a plain toggle', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Harness />);

      await user.keyboard('{Shift>}');
      await user.click(chip('16/08'));
      await user.keyboard('{/Shift}');

      expect(pressedDays()).toEqual(['2026-08-16']);
    });

    it('is one tab stop moved by arrows, Home and End; Space toggles and Shift+Space ranges', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Harness />);
      const chips = rail().getAllByTestId('cycle-date-chip');
      expect(chips.map((button) => button.tabIndex)).toEqual([0, -1, -1, -1]);

      chips[0].focus();
      await user.keyboard('{ArrowRight}');
      expect(chips[1]).toHaveFocus();
      await user.keyboard('{End}');
      expect(chips[3]).toHaveFocus();
      await user.keyboard('{ArrowRight}');
      expect(chips[3]).toHaveFocus();
      await user.keyboard('{Home}');
      expect(chips[0]).toHaveFocus();
      expect(chips.map((button) => button.tabIndex)).toEqual([0, -1, -1, -1]);

      await user.keyboard(' ');
      expect(pressedDays()).toEqual(['2026-08-02']);
      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect(chips[2]).toHaveFocus();
      expect(chips.map((button) => button.tabIndex)).toEqual([-1, -1, 0, -1]);
      await user.keyboard('{Shift>} {/Shift}');
      expect(pressedDays()).toEqual(['2026-08-02', '2026-08-09', '2026-08-16']);
      await user.keyboard(' ');
      expect(pressedDays()).toEqual(['2026-08-02', '2026-08-09']);
    });

    it('clears with Escape and with the clear chip, keeping focus on it and announcing the count', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderWithProviders(<Harness onChange={onChange} />);
      const clearChip = screen.getByTestId('cycle-date-strip-clear');
      const status = () =>
        screen.getByText(/selected$|^Showing all dates$/, {
          selector: '[aria-live="polite"]',
        });
      expect(status()).toHaveTextContent('Showing all dates');

      await user.click(chip('02/08'));
      await user.click(chip('16/08'));
      expect(status()).toHaveTextContent('2 days selected');
      expect(clearChip).toHaveTextContent('2 days');
      expect(clearChip).toHaveAccessibleName('Clear 2 selected days');

      chip('16/08').focus();
      await user.keyboard('{Escape}');
      expect(pressedDays()).toEqual([]);
      expect(boardColumns()).toHaveLength(4);
      expect(chip('16/08')).toHaveFocus();

      await user.click(chip('09/08'));
      await user.click(clearChip);
      expect(onChange).toHaveBeenLastCalledWith([]);
      expect(clearChip).toHaveFocus();
      expect(clearChip).toHaveAttribute('aria-disabled', 'true');
      expect(status()).toHaveTextContent('Showing all dates');

      // Inert while nothing is selected: no redundant write.
      onChange.mockClear();
      await user.click(clearChip);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('drops a filtered-out selected day from the board and says so', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Harness initial={['2026-08-09', '2026-08-16']} />);
      expect(boardColumns()).toEqual(['Sun, 09/08', 'Sun, 16/08']);
      expect(
        screen.queryByTestId('cycle-date-strip-hidden'),
      ).not.toBeInTheDocument();

      // The search narrows the chips to Aug 9; Aug 16 stays selected.
      await user.type(screen.getByLabelText('Search events'), 'Service 2');

      expect(rail().getAllByTestId('cycle-date-chip')).toHaveLength(1);
      expect(boardColumns()).toEqual(['Sun, 09/08']);
      expect(screen.getByTestId('cycle-date-strip-hidden')).toHaveTextContent(
        '1 selected day hidden by the filters',
      );
      expect(screen.getByTestId('cycle-date-strip-clear')).toHaveTextContent(
        '2 days',
      );

      // Clearing the filters brings the hidden day back as a column.
      await user.click(screen.getByRole('button', { name: 'Clear filters' }));
      expect(boardColumns()).toEqual(['Sun, 09/08', 'Sun, 16/08']);
      expect(
        screen.queryByTestId('cycle-date-strip-hidden'),
      ).not.toBeInTheDocument();
    });

    it('pans the rail when a drag starts on a chip, without toggling it', () => {
      const onChange = vi.fn();
      renderWithProviders(<Harness onChange={onChange} />);
      const sunday = chip('09/08');
      const viewport = screen.getByTestId('cycle-date-strip-viewport');

      fireEvent.pointerDown(sunday, { pointerId: 1, clientX: 200, buttons: 1 });
      fireEvent.pointerMove(sunday, { pointerId: 1, clientX: 100, buttons: 1 });
      fireEvent.pointerUp(sunday, { pointerId: 1 });
      fireEvent.click(sunday);

      expect(viewport.scrollLeft).toBe(100);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('colors a fully staffed date green, a partially staffed date amber, and an understaffed date red', () => {
      const staffedEvent: CycleBuilderData['events'][number] = {
        ...boardData.events[0],
        eventId: 'event-full',
        participationId: 'participation-full',
        title: 'Fully Staffed',
        start: '2026-08-02T09:00:00.000Z',
        end: '2026-08-02T11:00:00.000Z',
        peopleNeeded: 2,
        assignedCount: 2,
        fillRatio: 1,
      };
      const partialEvent: CycleBuilderData['events'][number] = {
        ...boardData.events[0],
        eventId: 'event-partial',
        participationId: 'participation-partial',
        title: 'Partially Staffed',
        start: '2026-08-09T09:00:00.000Z',
        end: '2026-08-09T11:00:00.000Z',
        peopleNeeded: 2,
        assignedCount: 1,
        fillRatio: 0.5,
        // Time blocks would otherwise still carry boardData's Aug 2 startTime,
        // so `eventOccursOnDay` (start-day-only, not a raw bounds check)
        // would never place the event under its own Aug 9 column.
        eventTimeBlockCount: 0,
        eventTimeBlocks: [],
      };
      const emptyEvent: CycleBuilderData['events'][number] = {
        ...boardData.events[0],
        eventId: 'event-empty',
        participationId: 'participation-empty',
        title: 'Understaffed',
        start: '2026-08-16T09:00:00.000Z',
        end: '2026-08-16T11:00:00.000Z',
        peopleNeeded: 2,
        assignedCount: 0,
        fillRatio: 0,
        eventTimeBlockCount: 0,
        eventTimeBlocks: [],
      };

      renderWithProviders(
        <CycleBuilderMatrix
          data={{
            ...boardData,
            events: [staffedEvent, partialEvent, emptyEvent],
          }}
          selectedDates={[]}
          onSelectedDatesChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      // Scoped to the date strip — event Badges elsewhere on the board
      // also render a `fillRatio`-derived percentage and would otherwise
      // collide with these queries.
      const dateStrip = within(
        screen.getByRole('group', { name: 'Cycle dates' }),
      );

      const fullCard = dateStrip.getByText('100%');
      expect(fullCard).toHaveClass('text-green-700');

      const partialCard = dateStrip.getByText('50%');
      expect(partialCard).toHaveClass('text-yellow-700');

      const emptyCard = dateStrip.getByText('0%');
      expect(emptyCard).toHaveClass('text-destructive');
    });

    it('shows a dash, not a red 0%, for a date with no requirements', () => {
      const noRequirementEvent: CycleBuilderData['events'][number] = {
        ...boardData.events[0],
        eventId: 'event-none',
        participationId: 'participation-none',
        title: 'Nothing Required',
        start: '2026-08-23T09:00:00.000Z',
        end: '2026-08-23T11:00:00.000Z',
        peopleNeeded: 0,
        assignedCount: 0,
        // See the partial/empty fixtures above: without this, the stale
        // Aug 2 time block would keep `eventOccursOnDay` from placing the event
        // under its own Aug 23 column.
        eventTimeBlockCount: 0,
        eventTimeBlocks: [],
      };

      renderWithProviders(
        <CycleBuilderMatrix
          data={{ ...boardData, events: [noRequirementEvent] }}
          selectedDates={[]}
          onSelectedDatesChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      // A day that needs nobody reads "—", never a red "0%" (A-report P3).
      const dateStrip = within(
        screen.getByRole('group', { name: 'Cycle dates' }),
      );
      expect(dateStrip.queryByText('0%')).not.toBeInTheDocument();
      const percentLabel = dateStrip.getByText('—');
      expect(percentLabel).not.toHaveClass('text-destructive');
      expect(percentLabel).toHaveClass('text-muted-foreground');
      expect(
        dateStrip.getByRole('button', {
          name: 'Sun, 23/08, no places needed, 1 event',
        }),
      ).toBeVisible();
    });
  });
});

const refreshProps = {
  selectedDates: [],
  onSelectedDatesChange: vi.fn(),
  onSelectVolunteer: vi.fn(),
  onSelectAssignment: vi.fn(),
  onRemoveAssignment: vi.fn(),
};

describe('focused candidates after a refreshed payload', () => {
  it('keeps an empty Role row focused and shows a newly added Role holder', async () => {
    overwriteGetLocale(() => 'pt-BR');
    const data = structuredClone(boardData);
    const shift = data.events[0].eventTimeBlocks[0].shifts[0];
    shift.eligibleVolunteers = [];
    shift.eligibleVolunteerCount = 0;
    const { rerender } = renderWithProviders(
      <CycleBuilderMatrix data={data} {...refreshProps} />,
    );
    const focus = screen.getByTestId(
      'cycle-requirement-focus-requirement-role-1',
    );
    await userEvent.click(focus);
    const refreshed = structuredClone(data);
    refreshed.events[0].eventTimeBlocks[0].shifts[0].eligibleVolunteers = [
      {
        volunteerId: 'new-holder',
        volunteerName: 'New Role Holder',
        answerState: 'available',
        conflict: null,
        qualifiedRoleIds: ['role-1'],
        ministryAccessLevel: 'volunteer',
      },
    ];
    rerender(<CycleBuilderMatrix data={refreshed} {...refreshProps} />);
    expect(focus).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(screen.getByTestId('volunteer-pool')).getByRole('button', {
        name: m.builder_ui_pick_me_person({ name: 'New Role Holder' }),
      }),
    ).toBeVisible();
  });
});

it('reranks the focused rail when a refreshed answer changes state', async () => {
  overwriteGetLocale(() => 'pt-BR');
  const data = structuredClone(boardData);
  const shift = data.events[0].eventTimeBlocks[0].shifts[0];
  shift.eligibleVolunteers = [
    {
      volunteerId: 'ada',
      volunteerName: 'Ada',
      answerState: 'available',
      conflict: null,
      qualifiedRoleIds: ['role-1'],
      ministryAccessLevel: 'volunteer',
    },
    {
      volunteerId: 'grace',
      volunteerName: 'Grace',
      answerState: 'unanswered',
      conflict: null,
      qualifiedRoleIds: ['role-1'],
      ministryAccessLevel: 'volunteer',
    },
  ];
  const { rerender } = renderWithProviders(
    <CycleBuilderMatrix data={data} {...refreshProps} />,
  );
  const focus = screen.getByTestId(
    'cycle-requirement-focus-requirement-role-1',
  );
  await userEvent.click(focus);
  const rail = within(screen.getByTestId('volunteer-pool'));
  expect(
    rail.getAllByTestId('volunteer-card').map((card) => card.textContent),
  ).toEqual([expect.stringContaining('Ada'), expect.stringContaining('Grace')]);
  const refreshed = structuredClone(data);
  const refreshedShift = refreshed.events[0].eventTimeBlocks[0].shifts[0];
  refreshedShift.eligibleVolunteers[0].answerState = 'unavailable';
  refreshedShift.eligibleVolunteers[1].answerState = 'available';
  rerender(<CycleBuilderMatrix data={refreshed} {...refreshProps} />);
  expect(focus).toHaveAttribute('aria-pressed', 'true');
  expect(
    rail.getAllByTestId('volunteer-card').map((card) => card.textContent),
  ).toEqual([expect.stringContaining('Grace'), expect.stringContaining('Ada')]);
});

for (const locale of ['en', 'pt-BR'] as const) {
  describe(`focused rail started Shift eligibility (${locale})`, () => {
    function renderFocusedRail() {
      overwriteGetLocale(() => locale);
      const data = structuredClone(boardData);
      data.events[0].eventTimeBlocks[0].shifts[0].eligibleVolunteers[0].qualifiedRoleIds =
        ['role-1'];
      const onSelectAssignment = vi.fn();
      renderWithProviders(
        <CycleBuilderMatrix
          data={data}
          {...refreshProps}
          onSelectAssignment={onSelectAssignment}
        />,
      );
      fireEvent.click(
        screen.getByTestId('cycle-requirement-focus-requirement-role-1'),
      );
      return {
        onSelectAssignment,
        rail: within(screen.getByTestId('volunteer-pool')),
      };
    }

    it.each([
      '2026-08-02T09:00:00Z',
      '2026-08-03T09:00:00Z',
    ])('shows no Assign action when a Shift is focused at %s', (clock) => {
      setTestClock({ instant: parseInstant({ value: clock }) });
      const { rail } = renderFocusedRail();
      expect(
        screen.getByTestId('cycle-requirement-focus-requirement-role-1'),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(
        rail.queryByRole('button', {
          name: m.builder_ui_pick_me_person({ name: 'Grace Hopper' }),
        }),
      ).not.toBeInTheDocument();
    });

    it('removes Assign while focus is retained across the Shift start', () => {
      vi.useFakeTimers();
      try {
        setTestClock({
          instant: parseInstant({ value: '2026-08-02T08:59:59Z' }),
        });
        const { rail } = renderFocusedRail();
        expect(
          rail.getByRole('button', {
            name: m.builder_ui_pick_me_person({ name: 'Grace Hopper' }),
          }),
        ).toBeVisible();
        setTestClock({
          instant: parseInstant({ value: '2026-08-02T09:00:00Z' }),
        });
        act(() => vi.advanceTimersByTime(30_000));
        expect(
          screen.getByTestId('cycle-requirement-focus-requirement-role-1'),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(
          rail.queryByRole('button', {
            name: m.builder_ui_pick_me_person({ name: 'Grace Hopper' }),
          }),
        ).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('refuses a focused pick at start before the next presentation refresh', () => {
      setTestClock({
        instant: parseInstant({ value: '2026-08-02T08:59:59Z' }),
      });
      const { rail, onSelectAssignment } = renderFocusedRail();
      const assign = rail.getByRole('button', {
        name: m.builder_ui_pick_me_person({ name: 'Grace Hopper' }),
      });
      setTestClock({
        instant: parseInstant({ value: '2026-08-02T09:00:00Z' }),
      });
      fireEvent.click(assign);
      expect(onSelectAssignment).not.toHaveBeenCalled();
    });
  });
}
