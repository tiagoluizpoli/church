import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditEventDialog } from './edit-event-dialog';
import type { EditingEventState } from './planning-admin.types';

const editingEvent: EditingEventState = {
  eventId: 'event-1',
  title: 'Sunday Service',
  description: '',
  location: '',
  startDateTimeLocal: '2026-06-28T09:00',
  originalStartDate: '2026-06-28T09:00:00.000Z',
  originalEndDate: '2026-06-28T10:00:00.000Z',
};

describe('EditEventDialog', () => {
  it('renders Cancel/Save via the footer prop, and Save calls onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <EditEventDialog
        editingEvent={editingEvent}
        updateEventPending={false}
        onChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    await user.click(saveButton);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('disables Save when the title is blank', () => {
    render(
      <EditEventDialog
        editingEvent={{ ...editingEvent, title: '  ' }}
        updateEventPending={false}
        onChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
