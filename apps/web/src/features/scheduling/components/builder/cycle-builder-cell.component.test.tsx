import { DndContext } from '@dnd-kit/core';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  CycleBuilderAssignment,
  CycleBuilderShiftSummary,
} from '../../hooks/use-cycle-builder';
import { CycleBuilderCell } from './cycle-builder-cell';
import { renderWithProviders } from '@/__tests__/setup/render';

const shift: CycleBuilderShiftSummary = {
  shiftId: 'shift-1',
  slotId: 'slot-1',
  startTime: '2026-08-02T09:00:00.000Z',
  endTime: '2026-08-02T10:00:00.000Z',
  requiredCount: 2,
  assignedCount: 0,
  requirements: [{ roleId: 'role-1', requiredCount: 2 }],
  assignments: [],
  eligibleVolunteerCount: 2,
  eligibleVolunteers: [
    {
      volunteerId: 'volunteer-1',
      volunteerName: 'Grace Hopper',
      isAvailable: true,
      hasConflict: false,
      qualifiedRoleIds: [],
    },
    {
      volunteerId: 'volunteer-2',
      volunteerName: 'Ada Lovelace',
      isAvailable: true,
      hasConflict: false,
      qualifiedRoleIds: [],
    },
  ],
};

const assignments: CycleBuilderAssignment[] = [
  {
    id: 'assignment-1',
    churchId: 'church-1',
    slotId: 'slot-1',
    shiftId: 'shift-1',
    volunteerId: 'volunteer-1',
    roleId: 'role-1',
    status: 'confirmed',
    assignedAt: '2026-08-01T09:00:00.000Z',
    volunteerName: 'Grace Hopper',
  },
  {
    id: 'assignment-2',
    churchId: 'church-1',
    slotId: 'slot-1',
    shiftId: 'shift-1',
    volunteerId: 'volunteer-2',
    roleId: 'role-1',
    status: 'confirmed',
    assignedAt: '2026-08-01T09:00:00.000Z',
    volunteerName: 'Ada Lovelace',
  },
];

function renderCell(
  overrides: Partial<ComponentProps<typeof CycleBuilderCell>> = {},
) {
  return renderWithProviders(
    <DndContext>
      <CycleBuilderCell
        shift={shift}
        roleId="role-1"
        roleLabel="Greeter"
        requiredCount={2}
        assignments={[]}
        pickerVolunteers={[
          {
            id: 'volunteer-1',
            name: 'Grace Hopper',
            availabilityStatus: 'available',
            alreadyAssignedCount: 0,
          },
        ]}
        suggestions={[
          {
            id: 'volunteer-1',
            name: 'Grace Hopper',
            status: 'available',
            workloadCount: 0,
          },
        ]}
        needsResponseSuggestions={[]}
        conflictSuggestions={[]}
        slotLabel="Morning service"
        isPublished={false}
        onFocus={vi.fn()}
        onToggleFocus={vi.fn()}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        {...overrides}
      />
    </DndContext>,
  );
}

describe('CycleBuilderCell', () => {
  it('shows one compact add chip while a role still has capacity', () => {
    renderCell({ assignments: [assignments[0]] });

    expect(screen.getByText('1/2')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(1);
    expect(
      screen.getByTestId('cycle-requirement-shift-1-role-1'),
    ).toHaveAttribute('data-drop-target', 'append');
  });

  it('removes the add chip at capacity and makes each assignment replaceable', () => {
    renderCell({ assignments });

    expect(screen.getByText('2/2')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Add' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('cycle-assignment-assignment-1')).toHaveAttribute(
      'data-drop-target',
      'replace',
    );
  });

  it('does not offer a direct assignment for someone already serving in the shift', () => {
    renderCell({
      shift: { ...shift, assignments: [assignments[0]] },
      selectedVolunteerId: 'volunteer-1',
      selectedVolunteerName: 'Grace Hopper',
    });

    expect(
      screen.queryByRole('button', { name: 'Assign Grace Hopper' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeVisible();
  });

  it('shows prototype-style recommendations only after Add is clicked', async () => {
    const user = userEvent.setup();
    const focus = vi.spyOn(HTMLInputElement.prototype, 'focus');
    renderCell();

    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Recommended')).toBeVisible();
    expect(screen.getAllByText('Grace Hopper')).toHaveLength(1);
    expect(screen.getByTestId('suggestion-option')).toBeVisible();
    expect(screen.getByTestId('assignment-picker')).toHaveClass('w-80', 'p-3');
    expect(screen.queryByText('No volunteers match')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('Search volunteers')).toHaveFocus(),
    );
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('offers a strong assign affordance where the selected volunteer fits', () => {
    renderCell({
      shift: {
        ...shift,
        eligibleVolunteers: [
          { ...shift.eligibleVolunteers[0], qualifiedRoleIds: ['role-1'] },
        ],
      },
      selectedVolunteerId: 'volunteer-1',
      selectedVolunteerName: 'Grace Hopper',
    });

    expect(
      screen.getByTestId('cycle-requirement-shift-1-role-1'),
    ).toHaveAttribute('data-selected-fit', 'ready');
    expect(
      screen.getByRole('button', { name: 'Assign Grace Hopper' }),
    ).toHaveClass('border-primary/60');
  });

  it('faints the affordance for a qualified but unavailable volunteer, keeping the override open', () => {
    renderCell({
      shift: {
        ...shift,
        eligibleVolunteers: [
          {
            ...shift.eligibleVolunteers[0],
            hasConflict: true,
            qualifiedRoleIds: ['role-1'],
          },
        ],
      },
      selectedVolunteerId: 'volunteer-1',
      selectedVolunteerName: 'Grace Hopper',
    });

    expect(
      screen.getByTestId('cycle-requirement-shift-1-role-1'),
    ).toHaveAttribute('data-selected-fit', 'override');
    const assign = screen.getByRole('button', { name: 'Assign Grace Hopper' });
    expect(assign).toHaveClass('text-muted-foreground');
    expect(assign).toHaveAttribute(
      'title',
      'Not available for this shift — assigning is an override',
    );
  });

  it('offers nothing but the ordinary picker where the selected volunteer is unqualified', () => {
    renderCell({
      shift: {
        ...shift,
        eligibleVolunteers: [
          { ...shift.eligibleVolunteers[0], qualifiedRoleIds: ['role-2'] },
          { ...shift.eligibleVolunteers[1], qualifiedRoleIds: ['role-1'] },
        ],
      },
      selectedVolunteerId: 'volunteer-1',
      selectedVolunteerName: 'Grace Hopper',
    });

    expect(
      screen.getByTestId('cycle-requirement-shift-1-role-1'),
    ).toHaveAttribute('data-selected-fit', 'none');
    expect(
      screen.queryByRole('button', { name: 'Assign Grace Hopper' }),
    ).not.toBeInTheDocument();
    // The cell must not go dead: the picker is still the way in.
    expect(screen.getByRole('button', { name: 'Add' })).toBeVisible();
  });

  it('sends the conflict with an override assignment so a reason is captured (FR-016)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderCell({
      shift: {
        ...shift,
        eligibleVolunteers: [
          {
            ...shift.eligibleVolunteers[0],
            hasConflict: true,
            qualifiedRoleIds: ['role-1'],
          },
        ],
      },
      selectedVolunteerId: 'volunteer-1',
      selectedVolunteerName: 'Grace Hopper',
      onSelect,
    });

    await user.click(
      screen.getByRole('button', { name: 'Assign Grace Hopper' }),
    );

    // `CycleBuilder` opens the override dialog on `conflictType` alone —
    // without it the assignment is applied with no reason and no audit.
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        volunteerId: 'volunteer-1',
        conflictType: 'double_booked',
      }),
    );
  });

  it('sends no conflict for a volunteer who is genuinely free', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderCell({
      shift: {
        ...shift,
        eligibleVolunteers: [
          { ...shift.eligibleVolunteers[0], qualifiedRoleIds: ['role-1'] },
        ],
      },
      selectedVolunteerId: 'volunteer-1',
      selectedVolunteerName: 'Grace Hopper',
      onSelect,
    });

    await user.click(
      screen.getByRole('button', { name: 'Assign Grace Hopper' }),
    );

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ conflictType: undefined }),
    );
  });

  it('focuses the rail on its own shift×role without opening the picker', async () => {
    const user = userEvent.setup();
    const onToggleFocus = vi.fn();
    renderCell({ onToggleFocus });

    await user.click(
      screen.getByRole('button', { name: 'Show volunteers for Greeter first' }),
    );

    expect(onToggleFocus).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('assignment-picker')).not.toBeInTheDocument();
  });

  it('marks the focus control as pressed while its own cell is focused', () => {
    renderCell({ isFocused: true });

    expect(
      screen.getByTestId('cycle-requirement-focus-shift-1-role-1'),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses a full volunteer name and an explicit unassign action for an existing assignment', async () => {
    const user = userEvent.setup();
    renderCell({ assignments: [assignments[0]] });

    const assignmentChip = screen.getByTestId('assignment-chip');
    expect(assignmentChip).toHaveTextContent('Grace Hopper');

    await user.click(assignmentChip);

    const unassign = screen.getByRole('button', { name: 'Unassign' });
    expect(unassign).toHaveClass('border-destructive/40');
    expect(unassign).not.toHaveClass('w-full');
  });
});
