import { parseInstant } from '@church/time';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CreateEventTimeBlockDialog } from '@/features/scheduling/components/planning-admin/create-event-time-block-dialog';
import type { CreatingEventTimeBlockState } from '@/features/scheduling/components/planning-admin/planning-admin.types';

const creatingEventTimeBlock: CreatingEventTimeBlockState = {
  eventId: 'event-1',
  label: 'Worship',
  start: parseInstant({ value: '2025-01-05T09:00:00Z' }),
  end: parseInstant({ value: '2025-01-05T10:00:00Z' }),
  isMultiDayEvent: false,
};

describe('CreateEventTimeBlockDialog', () => {
  it('renders Cancel/Add slot via the footer prop, and Add slot calls onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <CreateEventTimeBlockDialog
        creatingEventTimeBlock={creatingEventTimeBlock}
        createEventTimeBlockPending={false}
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
      <CreateEventTimeBlockDialog
        creatingEventTimeBlock={{
          ...creatingEventTimeBlock,
          start: parseInstant({ value: '2025-01-05T10:00:00Z' }),
          end: parseInstant({ value: '2025-01-05T09:00:00Z' }),
        }}
        createEventTimeBlockPending={false}
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
