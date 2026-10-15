import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OverrideDialog } from '@/features/scheduling/components/builder/assignment/override-dialog';

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  conflictType: 'unavailable' as const,
  volunteerName: 'John Doe',
  eventTimeBlockLabel: '9:00 AM – 11:00 AM',
  isPending: false,
  onConfirm: vi.fn(),
};

describe('OverrideDialog (T104)', () => {
  it('describes the conflict with the abbreviated volunteer name', () => {
    render(<OverrideDialog {...baseProps} />);
    expect(screen.getByText(/John D\. is unavailable/i)).toBeVisible();
  });

  it('names the role in the not-qualified variant (B-2)', async () => {
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

    await user.click(screen.getByRole('button', { name: /assign anyway/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('falls back to generic role copy when the gesture sent no role name', () => {
    render(<OverrideDialog {...baseProps} conflictType="not_qualified" />);
    expect(
      screen.getByText(/John D\. isn't qualified for this role/i),
    ).toBeVisible();
  });

  it('asks for no reason and confirms in one click', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<OverrideDialog {...baseProps} onConfirm={onConfirm} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirm override/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('shows a pending label while saving', () => {
    render(<OverrideDialog {...baseProps} isPending={true} />);
    expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
  });

  it('renders a Leader badge next to the title for a ministry Leader', () => {
    render(
      <OverrideDialog
        {...baseProps}
        volunteerName="Local Leader"
        volunteerMembership={{ ministryAccessLevel: 'leader' }}
      />,
    );
    expect(screen.getByTestId('assignee-role-badge')).toHaveTextContent(
      'Leader',
    );
  });

  it('renders no role badge for a plain volunteer', () => {
    render(
      <OverrideDialog
        {...baseProps}
        volunteerMembership={{
          ministryAccessLevel: 'volunteer',
        }}
      />,
    );
    expect(screen.queryByTestId('assignee-role-badge')).not.toBeInTheDocument();
  });
});
