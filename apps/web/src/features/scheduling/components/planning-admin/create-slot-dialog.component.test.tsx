import { parseInstant } from '@church/time';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CreateSlotDialog } from './create-slot-dialog';
import type { CreatingSlotState } from './planning-admin.types';

const creatingSlot: CreatingSlotState = {
  eventId: 'event-1',
  label: 'Worship',
  start: parseInstant({ value: '2025-01-05T09:00:00Z' }),
  end: parseInstant({ value: '2025-01-05T10:00:00Z' }),
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
        timeZone="UTC"
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
          start: parseInstant({ value: '2025-01-05T10:00:00Z' }),
          end: parseInstant({ value: '2025-01-05T09:00:00Z' }),
        }}
        createSlotPending={false}
        timeZone="UTC"
        onChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Add slot' })).toBeDisabled();
    expect(screen.getByText('End must be after start.')).toBeInTheDocument();
  });
});
