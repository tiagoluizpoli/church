import { DndContext } from '@dnd-kit/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CellAssignment } from './requirement-cell';
import { RequirementCell } from './requirement-cell';

function renderCell(ui: ReactElement) {
  return render(<DndContext>{ui}</DndContext>);
}

const baseProps = {
  slotId: 's1',
  roleId: 'r1',
  fillIndex: 0,
  suggestions: [],
  pickerVolunteers: [],
  isPublished: false,
  onAssign: vi.fn(),
  onRemove: vi.fn(),
};

const assignment: CellAssignment = {
  id: 'a1',
  volunteerId: 'v1',
  volunteerName: 'John Doe',
};

describe('RequirementCell', () => {
  describe('render states (T101)', () => {
    it('renders the suggestion list in the empty state', () => {
      renderCell(
        <RequirementCell
          {...baseProps}
          isReadOnly={false}
          suggestions={[
            {
              id: 'v1',
              name: 'Grace Hopper',
              status: 'available',
              workloadCount: 0,
            },
          ]}
        />,
      );
      expect(screen.getByTestId('suggestion-list')).toBeInTheDocument();
    });

    it('renders the assignment chip in the assigned state', () => {
      renderCell(
        <RequirementCell
          {...baseProps}
          isReadOnly={false}
          assignment={assignment}
        />,
      );
      expect(screen.getByTestId('assignment-chip')).toBeInTheDocument();
      expect(screen.getByText('John D.')).toBeVisible();
    });
  });

  describe('conflict styling (T106)', () => {
    it('shows the double-booked badge for a double-booked assignment', () => {
      renderCell(
        <RequirementCell
          {...baseProps}
          isReadOnly={false}
          assignment={{ ...assignment, conflictStatus: 'double_booked' }}
        />,
      );
      expect(screen.getByTestId('conflict-badge')).toHaveTextContent(
        'Double-booked',
      );
    });

    it('shows the unavailable badge for an unavailable assignment', () => {
      renderCell(
        <RequirementCell
          {...baseProps}
          isReadOnly={false}
          assignment={{ ...assignment, conflictStatus: 'unavailable' }}
        />,
      );
      expect(screen.getByTestId('conflict-badge')).toHaveTextContent(
        'Unavailable',
      );
    });

    it('shows no conflict badge when there is no conflict', () => {
      renderCell(
        <RequirementCell
          {...baseProps}
          isReadOnly={false}
          assignment={assignment}
        />,
      );
      expect(screen.queryByTestId('conflict-badge')).not.toBeInTheDocument();
    });
  });

  describe('read-only mode (T121)', () => {
    it('marks the cell read-only and applies muted styling', () => {
      renderCell(
        <RequirementCell
          {...baseProps}
          isReadOnly={true}
          assignment={assignment}
        />,
      );
      const cell = screen.getByTestId('requirement-cell');
      expect(cell).toHaveAttribute('data-readonly', 'true');
      expect(cell.className).toContain('cursor-not-allowed');
    });

    it('renders a non-interactive placeholder for a read-only empty cell', () => {
      renderCell(<RequirementCell {...baseProps} isReadOnly={true} />);
      // Read-only empty cells expose no interactive controls.
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getByText('—')).toBeVisible();
    });
  });

  describe('sidebar selection flow', () => {
    it('assigns the selected sidebar volunteer when the empty cell body is clicked', async () => {
      const user = userEvent.setup();
      const onAssignSelectedVolunteer = vi.fn();

      renderCell(
        <RequirementCell
          {...baseProps}
          isReadOnly={false}
          selectedVolunteerId="v2"
          selectedVolunteerName="Grace Hopper"
          onAssignSelectedVolunteer={onAssignSelectedVolunteer}
        />,
      );

      await user.click(screen.getByText(/or click empty space in cell/i));
      expect(onAssignSelectedVolunteer).toHaveBeenCalledTimes(1);
    });

    it('assigns the selected sidebar volunteer from explicit button', async () => {
      const user = userEvent.setup();
      const onAssignSelectedVolunteer = vi.fn();

      renderCell(
        <RequirementCell
          {...baseProps}
          isReadOnly={false}
          selectedVolunteerId="v2"
          selectedVolunteerName="Grace Hopper"
          onAssignSelectedVolunteer={onAssignSelectedVolunteer}
        />,
      );

      await user.click(
        screen.getByRole('button', { name: /assign grace hopper to slot/i }),
      );
      expect(onAssignSelectedVolunteer).toHaveBeenCalledTimes(1);
    });
  });
});
