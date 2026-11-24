import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssignmentChip } from '@/features/scheduling/components/builder/assignment/assignment-chip';

beforeEach(() => {
  overwriteGetLocale(() => 'en');
});

describe('AssignmentChip (T100)', () => {
  it('localizes the conflict label in Portuguese', () => {
    overwriteGetLocale(() => 'pt-BR');
    render(
      <AssignmentChip
        volunteerName="John Doe"
        conflictStatus="double_booked"
      />,
    );
    expect(screen.getByTestId('conflict-badge')).toHaveTextContent(
      m.builder_ui_double_booked(),
    );
  });
  it('renders the volunteer full name', () => {
    render(<AssignmentChip volunteerName="John Doe" />);
    expect(screen.getByText('John Doe')).toBeVisible();
  });

  describe('conflict badge', () => {
    it('shows a navy double-booked badge', () => {
      render(
        <AssignmentChip
          volunteerName="John Doe"
          conflictStatus="double_booked"
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
        />,
      );
      const badge = screen.getByTestId('conflict-badge');
      expect(badge).toHaveTextContent(m.builder_state_unavailable());
      expect(badge.className).toContain('bg-destructive');
    });

    it('shows no conflict badge when there is no conflict', () => {
      render(<AssignmentChip volunteerName="John Doe" />);
      expect(screen.queryByTestId('conflict-badge')).not.toBeInTheDocument();
    });
  });

  describe('role badge (FR-013)', () => {
    it('shows a Leader badge for a ministry Leader', () => {
      render(
        <AssignmentChip
          volunteerName="Local Leader"
          volunteerMembership={{
            ministryAccessLevel: 'leader',
          }}
        />,
      );
      expect(screen.getByTestId('assignee-role-badge')).toHaveTextContent(
        'Leader',
      );
    });

    it('shows no role badge for a plain volunteer', () => {
      render(
        <AssignmentChip
          volunteerName="John Doe"
          volunteerMembership={{
            ministryAccessLevel: 'volunteer',
          }}
        />,
      );
      expect(
        screen.queryByTestId('assignee-role-badge'),
      ).not.toBeInTheDocument();
    });
  });

  describe('sync state (B-1)', () => {
    it('reads as saved by default', () => {
      render(<AssignmentChip volunteerName="John Doe" />);
      expect(screen.getByTestId('assignment-chip')).toHaveAttribute(
        'data-sync-state',
        'saved',
      );
    });

    it('marks an in-flight write as pending with a dotted, faded chip', () => {
      render(<AssignmentChip volunteerName="John Doe" syncState="pending" />);
      const chip = screen.getByTestId('assignment-chip');
      expect(chip).toHaveAttribute('data-sync-state', 'pending');
      expect(chip.className).toContain('border-dotted');
      expect(chip.className).toContain('opacity-60');
      expect(chip).toHaveTextContent('Saving…');
    });

    it('marks a rejected write as failed', () => {
      render(<AssignmentChip volunteerName="John Doe" syncState="failed" />);
      const chip = screen.getByTestId('assignment-chip');
      expect(chip).toHaveAttribute('data-sync-state', 'failed');
      expect(chip.className).toContain('border-destructive');
      expect(chip).toHaveTextContent('Not saved');
    });
  });

  it('calls onClick when the chip is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<AssignmentChip volunteerName="John Doe" onClick={onClick} />);
    await user.click(screen.getByTestId('assignment-chip'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
