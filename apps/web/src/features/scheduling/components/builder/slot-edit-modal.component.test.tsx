import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SlotEditModal } from './slot-edit-modal';

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  mode: 'create' as const,
  eventType: 'hourly' as const,
  isPending: false,
  onSave: vi.fn(),
};

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function timeParts(iso: string) {
  const local = toLocalInput(iso);
  return {
    hour: local.slice(11, 13),
    minute: local.slice(14, 16),
  };
}

describe('SlotEditModal (T113)', () => {
  it('shows start/end time inputs for hourly events', () => {
    render(<SlotEditModal {...baseProps} eventType="hourly" />);
    expect(
      screen.getByRole('group', { name: /start time/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: /end time/i }),
    ).toBeInTheDocument();
  });

  it('hides time inputs for day-based events', () => {
    render(<SlotEditModal {...baseProps} eventType="day_based" />);
    expect(screen.queryByLabelText(/start time/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/end time/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/label/i)).toBeInTheDocument();
  });

  it('disables Save until both times are set (hourly)', async () => {
    const user = userEvent.setup();
    render(<SlotEditModal {...baseProps} eventType="hourly" />);
    const save = screen.getByRole('button', { name: /^save$/i });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText(/start time hour/i), '09');
    await user.type(screen.getByLabelText(/start time minute/i), '00');
    await user.type(screen.getByLabelText(/end time hour/i), '11');
    await user.type(screen.getByLabelText(/end time minute/i), '00');
    expect(save).toBeEnabled();
  });

  it('allows saving day-based slots without times', () => {
    render(<SlotEditModal {...baseProps} eventType="day_based" />);
    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled();
  });

  it('prefills start and end inputs from initial values', () => {
    render(
      <SlotEditModal
        {...baseProps}
        eventType="hourly"
        initial={{
          startTime: '2026-05-10T09:00:00.000Z',
          endTime: '2026-05-10T11:00:00.000Z',
        }}
      />,
    );

    const start = timeParts('2026-05-10T09:00:00.000Z');
    const end = timeParts('2026-05-10T11:00:00.000Z');

    expect(screen.getByLabelText(/start time hour/i)).toHaveValue(start.hour);
    expect(screen.getByLabelText(/start time minute/i)).toHaveValue(
      start.minute,
    );
    expect(screen.getByLabelText(/end time hour/i)).toHaveValue(end.hour);
    expect(screen.getByLabelText(/end time minute/i)).toHaveValue(end.minute);
    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled();
  });

  it('renders an inline error message', () => {
    render(
      <SlotEditModal {...baseProps} errorMessage="Slot overlaps another" />,
    );
    expect(screen.getByTestId('slot-error')).toHaveTextContent(
      'Slot overlaps another',
    );
  });

  it('calls onSave with entered values', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<SlotEditModal {...baseProps} eventType="hourly" onSave={onSave} />);
    await user.type(screen.getByLabelText(/start time hour/i), '09');
    await user.type(screen.getByLabelText(/start time minute/i), '00');
    await user.type(screen.getByLabelText(/end time hour/i), '11');
    await user.type(screen.getByLabelText(/end time minute/i), '00');
    await user.type(screen.getByLabelText(/label/i), 'Morning');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ label: 'Morning' });
  });
});
