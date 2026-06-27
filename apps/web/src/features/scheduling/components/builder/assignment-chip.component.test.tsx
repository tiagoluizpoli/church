import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AssignmentChip } from './assignment-chip';

describe('AssignmentChip (T100)', () => {
  it('renders the volunteer name as "First L."', () => {
    render(<AssignmentChip volunteerName="John Doe" isPublished={false} />);
    expect(screen.getByText('John D.')).toBeVisible();
  });

  describe('conflict badge', () => {
    it('shows an orange double-booked badge', () => {
      render(
        <AssignmentChip
          volunteerName="John Doe"
          conflictStatus="double_booked"
          isPublished={false}
        />,
      );
      const badge = screen.getByTestId('conflict-badge');
      expect(badge).toHaveTextContent('Double-booked');
      expect(badge.className).toContain('bg-orange-600');
    });

    it('shows a red unavailable badge', () => {
      render(
        <AssignmentChip
          volunteerName="John Doe"
          conflictStatus="unavailable"
          isPublished={false}
        />,
      );
      const badge = screen.getByTestId('conflict-badge');
      expect(badge).toHaveTextContent('Unavailable');
      expect(badge.className).toContain('bg-red-600');
    });

    it('shows no conflict badge when there is no conflict', () => {
      render(<AssignmentChip volunteerName="John Doe" isPublished={false} />);
      expect(screen.queryByTestId('conflict-badge')).not.toBeInTheDocument();
    });
  });

  describe('confirmation badge (published only)', () => {
    it('shows the confirmation badge when published', () => {
      render(
        <AssignmentChip
          volunteerName="John Doe"
          confirmationStatus="confirmed"
          isPublished={true}
        />,
      );
      expect(screen.getByLabelText('confirmed')).toBeInTheDocument();
    });

    it('hides the confirmation badge when not published', () => {
      render(
        <AssignmentChip
          volunteerName="John Doe"
          confirmationStatus="confirmed"
          isPublished={false}
        />,
      );
      expect(
        screen.queryByTestId('confirmation-badge'),
      ).not.toBeInTheDocument();
    });
  });

  it('calls onClick when the chip is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <AssignmentChip
        volunteerName="John Doe"
        isPublished={false}
        onClick={onClick}
      />,
    );
    await user.click(screen.getByTestId('assignment-chip'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
