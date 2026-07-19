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
    },
    {
      volunteerId: 'volunteer-2',
      volunteerName: 'Ada Lovelace',
      isAvailable: true,
      hasConflict: false,
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
