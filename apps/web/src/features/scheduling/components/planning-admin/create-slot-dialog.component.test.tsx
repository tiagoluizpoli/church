import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CreateSlotDialog } from './create-slot-dialog';
import type { CreatingSlotState } from './planning-admin.types';

const creatingSlot: CreatingSlotState = {
  eventId: 'event-1',
  label: 'Worship',
  startTimeLocal: '09:00',
  endTimeLocal: '10:00',
  isMultiDayEvent: false,
};

describe('CreateSlotDialog', () => {
  it('renders Cancel/Add slot via the footer prop, and Add slot calls onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <CreateSlotDialog
        creatingSlot={creatingSlot}
        createSlotPending={false}
        onChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const addButton = screen.getByRole('button', { name: 'Add slot' });
    expect(addButton).toBeEnabled();
    await user.click(addButton);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('disables Add slot and shows an inline error when start is at or after end', () => {
    render(
      <CreateSlotDialog
        creatingSlot={{
          ...creatingSlot,
          startTimeLocal: '10:00',
          endTimeLocal: '09:00',
        }}
        createSlotPending={false}
        onChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Add slot' })).toBeDisabled();
    expect(screen.getByText('End must be after start.')).toBeInTheDocument();
  });
});
