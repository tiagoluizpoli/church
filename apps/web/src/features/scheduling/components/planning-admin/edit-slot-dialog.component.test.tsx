import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditSlotDialog } from './edit-slot-dialog';
import type { EditingSlotState } from './planning-admin.types';

const editingSlot: EditingSlotState = {
  eventId: 'event-1',
  slotId: 'slot-1',
  label: 'Worship',
  startTimeLocal: '09:00',
  endTimeLocal: '10:00',
  isMultiDayEvent: false,
};

describe('EditSlotDialog', () => {
  it('renders Cancel/Save via the footer prop, and Save calls onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <EditSlotDialog
        editingSlot={editingSlot}
        updateSlotPending={false}
        onChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('disables Save and shows an inline error when start is at or after end', () => {
    render(
      <EditSlotDialog
        editingSlot={{
          ...editingSlot,
          startTimeLocal: '10:00',
          endTimeLocal: '09:00',
        }}
        updateSlotPending={false}
        onChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText('End must be after start.')).toBeInTheDocument();
  });
});
