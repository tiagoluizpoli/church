import { DndContext } from '@dnd-kit/core';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  CycleBuilderAssignment,
  CycleBuilderShiftSummary,
} from '../../../hooks/use-cycle-builder';
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
    // The fit ring is the only way to find where a selected person fits on a
    // horizontally-scrolling board, so it is full-opacity and 2px (B-3).
    expect(screen.getByTestId('cycle-requirement-shift-1-role-1')).toHaveClass(
      'ring-2',
      'ring-primary',
    );
    expect(
      screen.getByRole('button', { name: 'Assign Grace Hopper' }),
    ).toHaveClass('border-primary');
    expect(screen.getByRole('button', { name: 'Add' })).toBeVisible();
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
    // Dashed amber outline, not a fainter ring than the safe tier: the
    // dangerous one used to be the harder of the two to see (B-3).
    expect(screen.getByTestId('cycle-requirement-shift-1-role-1')).toHaveClass(
      'outline-2',
      'outline-dashed',
    );
    const assign = screen.getByRole('button', {
      name: 'Assign Grace Hopper — Not available for this shift — assigning is an override',
    });
    expect(assign).toHaveClass('text-yellow-700');
    // The explanation used to live in a native `title`, reachable by neither
    // keyboard nor screen reader.
    expect(assign).not.toHaveAttribute('title');
  });

  it('offers an unqualified selection with a warning instead of hiding it (B-2)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
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
      onSelect,
    });

    // Qualification is a soft constraint with friction, not a hard filter:
    // the fit still surfaces as an assignable tier the cell renders...
    expect(
      screen.getByTestId('cycle-requirement-shift-1-role-1'),
    ).toHaveAttribute('data-selected-fit', 'unqualified');
    // Dotted, not dashed: `unqualified` reads apart from `override` at a
    // glance, without hovering, even though both share the amber "needs a
    // reason" color (B-9).
    expect(screen.getByTestId('cycle-requirement-shift-1-role-1')).toHaveClass(
      'outline-2',
      'outline-dotted',
    );
    // ...and Add stays available beside it — selecting someone must not take
    // away the picker from the cells where they don't qualify (B-7).
    expect(screen.getByRole('button', { name: 'Add' })).toBeVisible();

    const assign = screen.getByRole('button', {
      name: 'Assign Grace Hopper — Not qualified for this role — assigning needs a reason',
    });
    expect(assign).toHaveClass('text-yellow-700');

    await user.click(assign);

    // `overrideKindForFit()` translates the tier to `not_qualified`, which
    // opens `OverrideDialog`'s not-qualified variant (FR-016) — the same path
    // every other override reaches, never a silent commit.
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        volunteerId: 'volunteer-1',
        conflictType: 'not_qualified',
      }),
    );
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
      screen.getByRole('button', { name: /^Assign Grace Hopper/ }),
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

  describe('write state (B-1)', () => {
    it('renders an in-flight row as pending and refuses to edit or replace it', async () => {
      const user = userEvent.setup();
      renderCell({
        assignments: [{ ...assignments[0], id: 'optimistic:abc' }],
      });

      const chip = screen.getByTestId('assignment-chip');
      expect(chip).toHaveAttribute('data-sync-state', 'pending');
      expect(
        screen.getByTestId('cycle-assignment-optimistic:abc'),
      ).not.toHaveAttribute('data-drop-target');

      await user.click(chip);
      expect(screen.queryByTestId('assignment-picker')).not.toBeInTheDocument();
    });

    it('keeps a rejected write on the board with a retry and a dismiss', async () => {
      const user = userEvent.setup();
      const onRetryFailedWrite = vi.fn();
      const onDismissFailedWrite = vi.fn();
      renderCell({
        failedWrites: [
          {
            failedWriteId: 'failed-1',
            shiftId: 'shift-1',
            roleId: 'role-1',
            volunteerId: 'volunteer-2',
            volunteerName: 'Ada Lovelace',
            message: 'Volunteer is unavailable',
          },
        ],
        onRetryFailedWrite,
        onDismissFailedWrite,
      });

      const chip = screen.getByTestId('assignment-chip');
      expect(chip).toHaveAttribute('data-sync-state', 'failed');
      expect(chip).toHaveTextContent('Ada Lovelace');

      await user.click(screen.getByTestId('cycle-failed-assignment-retry'));
      expect(onRetryFailedWrite).toHaveBeenCalledWith('failed-1');

      await user.click(screen.getByTestId('cycle-failed-assignment-dismiss'));
      expect(onDismissFailedWrite).toHaveBeenCalledWith('failed-1');
    });
  });
});
