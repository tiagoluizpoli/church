import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OverrideDialog } from './override-dialog';

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  conflictType: 'double_booked' as const,
  volunteerName: 'John Doe',
  slotLabel: '9:00 AM – 11:00 AM',
  isPending: false,
  onConfirm: vi.fn(),
};

describe('OverrideDialog (T104)', () => {
  it('describes the conflict with the abbreviated volunteer name', () => {
    render(<OverrideDialog {...baseProps} />);
    expect(screen.getByText(/John D\. is double-booked/i)).toBeVisible();
  });

  it('disables Confirm until the reason reaches 10 characters', async () => {
    const user = userEvent.setup();
    render(<OverrideDialog {...baseProps} />);
    const confirm = screen.getByRole('button', { name: /confirm override/i });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByRole('textbox'), 'too short'); // 9 chars
    expect(confirm).toBeDisabled();

    await user.type(screen.getByRole('textbox'), '!'); // now 10
    expect(confirm).toBeEnabled();
  });

  it('shows a character counter', async () => {
    const user = userEvent.setup();
    render(<OverrideDialog {...baseProps} />);
    await user.type(screen.getByRole('textbox'), 'abcde');
    expect(screen.getByText('5/10')).toBeVisible();
  });

  it('calls onConfirm with the trimmed reason', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<OverrideDialog {...baseProps} onConfirm={onConfirm} />);
    await user.type(screen.getByRole('textbox'), '  valid reason text  ');
    await user.click(screen.getByRole('button', { name: /confirm override/i }));
    expect(onConfirm).toHaveBeenCalledWith('valid reason text');
  });

  it('shows a pending label while saving', () => {
    render(<OverrideDialog {...baseProps} isPending={true} />);
    expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
  });
});
