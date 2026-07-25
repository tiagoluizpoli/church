import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AssignmentChip } from './assignment-chip';

describe('AssignmentChip (T100)', () => {
  it('renders the volunteer full name', () => {
    render(<AssignmentChip volunteerName="John Doe" isPublished={false} />);
    expect(screen.getByText('John Doe')).toBeVisible();
  });

  describe('conflict badge', () => {
    it('shows a navy double-booked badge', () => {
      render(
        <AssignmentChip
          volunteerName="John Doe"
          conflictStatus="double_booked"
          isPublished={false}
        />,
      );
      const badge = screen.getByTestId('conflict-badge');
      expect(badge).toHaveTextContent('Double-booked');
      expect(badge.className).toContain('bg-primary');
    });

    it('shows a destructive unavailable badge', () => {
      render(
        <AssignmentChip
          volunteerName="John Doe"
          conflictStatus="unavailable"
          isPublished={false}
        />,
      );
      const badge = screen.getByTestId('conflict-badge');
      expect(badge).toHaveTextContent('Unavailable');
      expect(badge.className).toContain('bg-destructive');
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

  describe('role badge (FR-013)', () => {
    it('disambiguates two identically-truncating volunteers by role', () => {
      const { rerender } = render(
        <AssignmentChip
          volunteerName="Local Leader"
          volunteerSystemRole="leader"
          isPublished={false}
        />,
      );
      expect(screen.getByTestId('assignee-role-badge')).toHaveTextContent(
        'Leader',
      );

      rerender(
        <AssignmentChip
          volunteerName="Local Sub Leader"
          volunteerSystemRole="sub_leader"
          isPublished={false}
        />,
      );
      expect(screen.getByTestId('assignee-role-badge')).toHaveTextContent(
        'Sub-leader',
      );
    });

    it('shows no role badge for a plain volunteer', () => {
      render(
        <AssignmentChip
          volunteerName="John Doe"
          volunteerSystemRole="volunteer"
          isPublished={false}
        />,
      );
      expect(
        screen.queryByTestId('assignee-role-badge'),
      ).not.toBeInTheDocument();
    });
  });

  describe('sync state (B-1)', () => {
    it('reads as saved by default', () => {
      render(<AssignmentChip volunteerName="John Doe" isPublished={false} />);
      expect(screen.getByTestId('assignment-chip')).toHaveAttribute(
        'data-sync-state',
        'saved',
      );
    });

    it('marks an in-flight write as pending with a dotted, faded chip', () => {
      render(
        <AssignmentChip
          volunteerName="John Doe"
          isPublished={false}
          syncState="pending"
        />,
      );
      const chip = screen.getByTestId('assignment-chip');
      expect(chip).toHaveAttribute('data-sync-state', 'pending');
      expect(chip.className).toContain('border-dotted');
      expect(chip.className).toContain('opacity-60');
      expect(chip).toHaveTextContent('Saving…');
    });

    it('marks a rejected write as failed', () => {
      render(
        <AssignmentChip
          volunteerName="John Doe"
          isPublished={false}
          syncState="failed"
        />,
      );
      const chip = screen.getByTestId('assignment-chip');
      expect(chip).toHaveAttribute('data-sync-state', 'failed');
      expect(chip.className).toContain('border-destructive');
      expect(chip).toHaveTextContent('Not saved');
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
