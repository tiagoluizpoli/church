import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  CycleBuilderAssignment,
  CycleBuilderData,
  CycleBuilderEligibleVolunteerSummary,
} from '../../../hooks/use-cycle-builder';
import { CycleBuilderMatrix } from './cycle-builder-matrix';
import { pickCalendarDate } from '@/__tests__/setup/date-picker';
import { renderWithProviders } from '@/__tests__/setup/render';

const boardData: CycleBuilderData = {
  assignments: [],
  roles: [{ id: 'role-1', name: 'Greeter' }],
  events: [
    {
      participationId: 'participation-1',
      state: 'rostering',
      eventId: 'event-1',
      title: 'Sunday Gathering',
      startDate: '2026-08-02T09:00:00.000Z',
      endDate: '2026-08-02T11:00:00.000Z',
      status: 'scheduled',
      eventType: 'hourly',
      fillRatio: 0,
      requiredCount: 2,
      assignedCount: 0,
      slotCount: 1,
      slots: [
        {
          slotId: 'slot-1',
          label: 'Morning service',
          startTime: '2026-08-02T09:00:00.000Z',
          endTime: '2026-08-02T11:00:00.000Z',
          included: true,
          requiredCount: 2,
          assignedCount: 0,
          shiftCount: 1,
          shifts: [
            {
              shiftId: 'shift-1',
              slotId: 'slot-1',
              startTime: '2026-08-02T09:00:00.000Z',
              endTime: '2026-08-02T11:00:00.000Z',
              requiredCount: 2,
              assignedCount: 0,
              requirements: [{ roleId: 'role-1', requiredCount: 2 }],
              assignments: [],
              eligibleVolunteerCount: 1,
              eligibleVolunteers: [
                {
                  volunteerId: 'volunteer-1',
                  volunteerName: 'Grace Hopper',
                  isAvailable: true,
                  hasConflict: false,
                  qualifiedRoleIds: [],
                  ministryAccessLevel: 'volunteer',
                  leadTeamIds: [],
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
  slotId: 'slot-1',
  shiftId: 'shift-1',
  volunteerId: 'volunteer-1',
  roleId: 'role-support',
  status: 'confirmed',
  assignedAt: '2026-08-01T09:00:00.000Z',
  volunteerName: 'Local Volunteer',
};

function boardDataWithShiftAssignments(): CycleBuilderData {
  const event = boardData.events[0];
  const slot = event?.slots[0];
  const morningShift = slot?.shifts[0];

  if (!(event && slot && morningShift)) {
    throw new Error('Board fixture is incomplete');
  }

  // Both are qualified for both roles: this fixture is about *where someone is
  // already serving*, and since B-2 an unqualified volunteer is no longer
  // recommended at all — which would hide the very distinction under test.
  const eligibleVolunteers: CycleBuilderEligibleVolunteerSummary[] = [
    {
      volunteerId: 'volunteer-1',
      volunteerName: 'Local Volunteer',
      isAvailable: true,
      hasConflict: false,
      qualifiedRoleIds: ['role-support', 'role-coordinator'],
      ministryAccessLevel: 'volunteer',
      leadTeamIds: [],
    },
    {
      volunteerId: 'volunteer-2',
      volunteerName: 'Available Volunteer',
      isAvailable: true,
      hasConflict: false,
      qualifiedRoleIds: ['role-support', 'role-coordinator'],
      ministryAccessLevel: 'volunteer',
      leadTeamIds: [],
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
        requiredCount: 3,
        assignedCount: 1,
        slots: [
          {
            ...slot,
            requiredCount: 3,
            assignedCount: 1,
            shiftCount: 2,
            shifts: [
              {
                ...morningShift,
                label: 'Morning',
                requiredCount: 2,
                assignedCount: 1,
                requirements: [
                  { roleId: 'role-support', requiredCount: 1 },
                  { roleId: 'role-coordinator', requiredCount: 1 },
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
                requiredCount: 1,
                assignedCount: 0,
                requirements: [
                  { roleId: 'role-coordinator', requiredCount: 1 },
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
  it('excludes same-shift assignees and warns when they serve in another shift', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CycleBuilderMatrix
        data={boardDataWithShiftAssignments()}
        selectedDate="2026-08-02"
        onSelectedDateChange={vi.fn()}
        onSelectVolunteer={vi.fn()}
        onSelectAssignment={vi.fn()}
        onRemoveAssignment={vi.fn()}
      />,
    );

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

  it('renders each date as a compact event, slot, shift, and role column', () => {
    renderWithProviders(
      <CycleBuilderMatrix
        data={boardData}
        selectedDate="2026-08-02"
        onSelectedDateChange={vi.fn()}
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
    expect(screen.getByText('Greeter')).toBeVisible();
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
              startDate: '2026-08-05T19:00:00.000Z',
              endDate: '2026-08-05T21:00:00.000Z',
              slots: [],
            },
          ],
        }}
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
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
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
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
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
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
        selectedDate={null}
        onSelectedDateChange={vi.fn()}
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
        startDate: '2026-08-09T09:00:00.000Z',
        endDate: '2026-08-09T11:00:00.000Z',
      };

      renderWithProviders(
        <CycleBuilderMatrix
          data={{ ...boardData, events: [boardData.events[0], secondSunday] }}
          selectedDate={null}
          onSelectedDateChange={vi.fn()}
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
        startDate: '2026-08-09T09:00:00.000Z',
        endDate: '2026-08-09T11:00:00.000Z',
      };

      renderWithProviders(
        <CycleBuilderMatrix
          data={{ ...boardData, events: [boardData.events[0], secondSunday] }}
          selectedDate={null}
          onSelectedDateChange={vi.fn()}
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
          selectedDate={null}
          onSelectedDateChange={vi.fn()}
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
        startDate: '2026-08-09T09:00:00.000Z',
        endDate: '2026-08-09T11:00:00.000Z',
      };

      renderWithProviders(
        <CycleBuilderMatrix
          data={{ ...boardData, events: [boardData.events[0], secondSunday] }}
          selectedDate={null}
          onSelectedDateChange={vi.fn()}
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
          selectedDate={null}
          onSelectedDateChange={vi.fn()}
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
          selectedDate={null}
          onSelectedDateChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      const search = screen.getByLabelText('Search events');
      const modeButton = screen.getByRole('button', { name: 'Event dates' });
      // jsdom's `matchMedia` stub (see __tests__/setup/component.ts) makes
      // `useMediaQuery('(max-width: 767px)')` resolve true, so this panel
      // renders under the touch form-control size here — both controls
      // should resolve to that same height. Previously the search input
      // hardcoded h-8 and the buttons hardcoded size="sm" (h-7), so neither
      // followed the surrounding `FormControlSizeProvider` at all.
      expect(search).toHaveClass('h-11');
      expect(modeButton).toHaveClass('h-11');
    });

    it('pins "All dates" outside the draggable date strip, disabled until a date column is selected', () => {
      const { rerender } = renderWithProviders(
        <CycleBuilderMatrix
          data={boardData}
          selectedDate={null}
          onSelectedDateChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      const allDatesButton = screen.getByTestId('cycle-date-strip-focus');
      // Informational while nothing is focused — and not a control at all.
      // It used to be a `disabled` button with `disabled:opacity-100`, which
      // looks live, cannot be reached, and carried an `aria-pressed` state it
      // had no way to change (B-3).
      expect(allDatesButton.tagName).toBe('DIV');
      expect(allDatesButton).not.toHaveAttribute('aria-pressed');
      expect(allDatesButton).toHaveTextContent('All dates');
      expect(allDatesButton).toHaveTextContent('Select a day');
      // The date strip's pointer-drag handlers live on the
      // `aria-label="Cycle dates"` section — the pinned control must sit
      // outside it so it can never be swallowed by the pan gesture.
      expect(allDatesButton.closest('[aria-label="Cycle dates"]')).toBeNull();

      rerender(
        <CycleBuilderMatrix
          data={boardData}
          selectedDate="2026-08-02"
          onSelectedDateChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      // Once a date is focused it names that date and becomes an active
      // clear control.
      const focusedButton = screen.getByTestId('cycle-date-strip-focus');
      expect(focusedButton.tagName).toBe('BUTTON');
      expect(focusedButton).not.toBeDisabled();
      expect(focusedButton).toHaveTextContent('Show all dates');
    });

    it('no longer renders "All dates" inside the filter row itself', () => {
      renderWithProviders(
        <CycleBuilderMatrix
          data={boardData}
          selectedDate="2026-08-02"
          onSelectedDateChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      const clearFiltersButton = screen.getByRole('button', {
        name: 'Clear filters',
      });
      const allDatesButton = screen.getByTestId('cycle-date-strip-focus');
      expect(clearFiltersButton.closest('section')).not.toBe(
        allDatesButton.closest('section'),
      );
    });

    it('"Clear filters" is disabled at defaults, enables once dirtied, and resets the search input', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <CycleBuilderMatrix
          data={boardData}
          selectedDate={null}
          onSelectedDateChange={vi.fn()}
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
        startDate: '2026-08-01T09:00:00.000Z',
        endDate: '2026-08-03T11:00:00.000Z',
      };
      const lateEvent: CycleBuilderData['events'][number] = {
        ...boardData.events[0],
        eventId: 'event-late',
        participationId: 'participation-late',
        title: 'Late Retreat',
        startDate: '2026-08-10T09:00:00.000Z',
        endDate: '2026-08-12T11:00:00.000Z',
      };

      renderWithProviders(
        <CycleBuilderMatrix
          data={{ ...boardData, events: [earlyEvent, lateEvent] }}
          selectedDate={null}
          onSelectedDateChange={vi.fn()}
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
      await pickCalendarDate({ user, trigger: rangeStart, date: '2026-08-11' });

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
    it('reserves clearance below the date-strip and board scrollbars so they do not overlap clickable content', () => {
      renderWithProviders(
        <CycleBuilderMatrix
          data={boardData}
          selectedDate={null}
          onSelectedDateChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      // The horizontal `ScrollBar` overlays the bottom of its `ScrollArea`
      // root — without bottom padding on the root itself, that overlay sat
      // directly on top of the date cards' lower edge and silently ate
      // clicks there. `pb-3` reserves real, empty space for it instead.
      expect(screen.getByTestId('cycle-date-strip-scroll')).toHaveClass('pb-3');
      expect(screen.getByTestId('cycle-board-scroll')).toHaveClass('pb-3');
    });

    it('selects a date by clicking its focus button, reliably and without arming a drag', async () => {
      const user = userEvent.setup();
      const onSelectedDateChange = vi.fn();
      renderWithProviders(
        <CycleBuilderMatrix
          data={boardData}
          selectedDate={null}
          onSelectedDateChange={onSelectedDateChange}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      const dateStrip = within(
        screen.getByRole('region', { name: 'Cycle dates' }),
      );
      const focusButton = dateStrip.getByRole('button', {
        name: /Show only.*Aug 2/,
      });
      const viewport = screen.getByTestId('cycle-date-strip-viewport');

      await user.click(focusButton);

      expect(onSelectedDateChange).toHaveBeenCalledTimes(1);
      expect(onSelectedDateChange).toHaveBeenCalledWith('2026-08-02');
      // The focus button is a real, isolated interactive element excluded
      // from drag-arming entirely — clicking it never touches the pan
      // gesture, unlike when the whole card used to be one giant button.
      expect(viewport.scrollLeft).toBe(0);
    });

    it('swaps the focus-button label once a date is selected', () => {
      const { rerender } = renderWithProviders(
        <CycleBuilderMatrix
          data={boardData}
          selectedDate={null}
          onSelectedDateChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      expect(
        within(screen.getByRole('region', { name: 'Cycle dates' })).getByRole(
          'button',
          { name: /Show only.*Aug 2/ },
        ),
      ).toBeVisible();

      rerender(
        <CycleBuilderMatrix
          data={boardData}
          selectedDate="2026-08-02"
          onSelectedDateChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      expect(
        within(screen.getByRole('region', { name: 'Cycle dates' })).getByRole(
          'button',
          { name: 'Show all dates' },
        ),
      ).toBeVisible();
    });

    it('does not pan when pressing and moving on the focus button', () => {
      renderWithProviders(
        <CycleBuilderMatrix
          data={boardData}
          selectedDate={null}
          onSelectedDateChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      const dateStrip = within(
        screen.getByRole('region', { name: 'Cycle dates' }),
      );
      const focusButton = dateStrip.getByRole('button', {
        name: /Show only.*Aug 2/,
      });
      const viewport = screen.getByTestId('cycle-date-strip-viewport');

      fireEvent.pointerDown(focusButton, {
        pointerId: 1,
        clientX: 200,
        buttons: 1,
      });
      fireEvent.pointerMove(focusButton, {
        pointerId: 1,
        clientX: 100,
        buttons: 1,
      });

      expect(viewport.scrollLeft).toBe(0);
    });

    it('pans the strip when the drag starts directly on a date card (not its focus button)', () => {
      renderWithProviders(
        <CycleBuilderMatrix
          data={boardData}
          selectedDate={null}
          onSelectedDateChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      const dateStrip = within(
        screen.getByRole('region', { name: 'Cycle dates' }),
      );
      // The event-count text is part of the card body, not the focus
      // button — pressing and dragging from there must still pan, since
      // almost the entire card is now plain drag surface.
      const cardBody = dateStrip.getByText('1 event');
      const viewport = screen.getByTestId('cycle-date-strip-viewport');

      fireEvent.pointerDown(cardBody, {
        pointerId: 1,
        clientX: 200,
        buttons: 1,
      });
      fireEvent.pointerMove(cardBody, {
        pointerId: 1,
        clientX: 100,
        buttons: 1,
      });

      expect(viewport.scrollLeft).toBe(100);
    });

    it('still pans the strip when the drag starts on empty space between cards', () => {
      renderWithProviders(
        <CycleBuilderMatrix
          data={boardData}
          selectedDate={null}
          onSelectedDateChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      const dragSurface = screen.getByRole('region', { name: 'Cycle dates' });
      const viewport = screen.getByTestId('cycle-date-strip-viewport');

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
    });

    it('colors a fully staffed date green, a partially staffed date amber, and an understaffed date red', () => {
      const staffedEvent: CycleBuilderData['events'][number] = {
        ...boardData.events[0],
        eventId: 'event-full',
        participationId: 'participation-full',
        title: 'Fully Staffed',
        startDate: '2026-08-02T09:00:00.000Z',
        endDate: '2026-08-02T11:00:00.000Z',
        requiredCount: 2,
        assignedCount: 2,
      };
      const partialEvent: CycleBuilderData['events'][number] = {
        ...boardData.events[0],
        eventId: 'event-partial',
        participationId: 'participation-partial',
        title: 'Partially Staffed',
        startDate: '2026-08-09T09:00:00.000Z',
        endDate: '2026-08-09T11:00:00.000Z',
        requiredCount: 2,
        assignedCount: 1,
      };
      const emptyEvent: CycleBuilderData['events'][number] = {
        ...boardData.events[0],
        eventId: 'event-empty',
        participationId: 'participation-empty',
        title: 'Understaffed',
        startDate: '2026-08-16T09:00:00.000Z',
        endDate: '2026-08-16T11:00:00.000Z',
        requiredCount: 2,
        assignedCount: 0,
      };

      renderWithProviders(
        <CycleBuilderMatrix
          data={{
            ...boardData,
            events: [staffedEvent, partialEvent, emptyEvent],
          }}
          selectedDate={null}
          onSelectedDateChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      // Scoped to the date strip — event Badges elsewhere on the board
      // also render a `fillRatio`-derived percentage and would otherwise
      // collide with these queries.
      const dateStrip = within(
        screen.getByRole('region', { name: 'Cycle dates' }),
      );

      const fullCard = dateStrip.getByText('100%');
      expect(fullCard).toHaveClass('text-green-700');

      const partialCard = dateStrip.getByText('50%');
      expect(partialCard).toHaveClass('text-yellow-700');

      const emptyCard = dateStrip.getByText('0%');
      expect(emptyCard).toHaveClass('text-destructive');
    });

    it('leaves a date with no requirements neutral instead of flagging it red', () => {
      const noRequirementEvent: CycleBuilderData['events'][number] = {
        ...boardData.events[0],
        eventId: 'event-none',
        participationId: 'participation-none',
        title: 'Nothing Required',
        startDate: '2026-08-23T09:00:00.000Z',
        endDate: '2026-08-23T11:00:00.000Z',
        requiredCount: 0,
        assignedCount: 0,
      };

      renderWithProviders(
        <CycleBuilderMatrix
          data={{ ...boardData, events: [noRequirementEvent] }}
          selectedDate={null}
          onSelectedDateChange={vi.fn()}
          onSelectVolunteer={vi.fn()}
          onSelectAssignment={vi.fn()}
          onRemoveAssignment={vi.fn()}
        />,
      );

      const percentLabel = within(
        screen.getByRole('region', { name: 'Cycle dates' }),
      ).getByText('0%');
      expect(percentLabel).not.toHaveClass('text-destructive');
      expect(percentLabel).toHaveClass('text-muted-foreground');
    });
  });
});
