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

  it('names the role in the not-qualified variant and still demands a reason (B-2)', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <OverrideDialog
        {...baseProps}
        conflictType="not_qualified"
        roleLabel="Sound"
        onConfirm={onConfirm}
      />,
    );

    // "isn't qualified for this role" would waste the variant — the whole
    // point is that the leader is told which role she is forcing.
    expect(
      screen.getByText(/John D\. isn't qualified for Sound/i),
    ).toBeVisible();

    const confirm = screen.getByRole('button', { name: /assign anyway/i });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole('textbox'), 'covering for Ana');
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('covering for Ana');
  });

  it('falls back to generic role copy when the gesture sent no role name', () => {
    render(<OverrideDialog {...baseProps} conflictType="not_qualified" />);
    expect(
      screen.getByText(/John D\. isn't qualified for this role/i),
    ).toBeVisible();
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

  it("renders a role badge next to the title when the volunteer is a ministry Leader or a Team Leader of the conflicted slot's team (FR-013)", () => {
    render(
      <OverrideDialog
        {...baseProps}
        volunteerName="Local Team Leader"
        volunteerMembership={{
          ministryAccessLevel: 'volunteer',
          leadTeamIds: ['team-a'],
        }}
        contextTeamId="team-a"
      />,
    );
    expect(screen.getByTestId('assignee-role-badge')).toHaveTextContent(
      'Team Leader',
    );
  });

  it('renders no role badge for a plain volunteer', () => {
    render(
      <OverrideDialog
        {...baseProps}
        volunteerMembership={{
          ministryAccessLevel: 'volunteer',
          leadTeamIds: [],
        }}
      />,
    );
    expect(screen.queryByTestId('assignee-role-badge')).not.toBeInTheDocument();
  });

  it('renders no Team Leader badge when the conflicted slot is outside the team this volunteer leads (regression guard)', () => {
    render(
      <OverrideDialog
        {...baseProps}
        volunteerName="Local Team Leader"
        volunteerMembership={{
          ministryAccessLevel: 'volunteer',
          leadTeamIds: ['team-a'],
        }}
        contextTeamId="team-b"
      />,
    );
    expect(screen.queryByTestId('assignee-role-badge')).not.toBeInTheDocument();
  });
});
