import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoleCountControl } from './role-count-control';

describe('RoleCountControl (T115)', () => {
  it('renders the current count', () => {
    render(
      <RoleCountControl
        count={3}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
      />,
    );
    expect(screen.getByText('3')).toBeVisible();
  });

  it('calls onIncrement / onDecrement on click', async () => {
    const user = userEvent.setup();
    const onIncrement = vi.fn();
    const onDecrement = vi.fn();
    render(
      <RoleCountControl
        count={3}
        onIncrement={onIncrement}
        onDecrement={onDecrement}
      />,
    );
    await user.click(screen.getByRole('button', { name: /increase count/i }));
    await user.click(screen.getByRole('button', { name: /decrease count/i }));
    expect(onIncrement).toHaveBeenCalledTimes(1);
    expect(onDecrement).toHaveBeenCalledTimes(1);
  });

  it('disables decrement at the minimum (count = 1)', () => {
    render(
      <RoleCountControl
        count={1}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /decrease count/i }),
    ).toBeDisabled();
  });

  it('disables both buttons when disabled prop is set', () => {
    render(
      <RoleCountControl
        count={3}
        disabled
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /increase count/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /decrease count/i }),
    ).toBeDisabled();
  });
});
