import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PickerVolunteer } from './assignment-picker';
import { SubstitutionPicker } from './substitution-picker';

const pv = (
  id: string,
  name: string,
  availabilityStatus: PickerVolunteer['availabilityStatus'],
  systemRole?: PickerVolunteer['systemRole'],
): PickerVolunteer => ({
  id,
  name,
  availabilityStatus,
  systemRole,
  alreadyAssignedCount: 0,
});

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  declinedVolunteerName: 'John Doe',
  declinedVolunteerId: 'declined-1',
  onSelect: vi.fn(),
};

describe('SubstitutionPicker (T109)', () => {
  it('pins the declined volunteer at the top', () => {
    render(<SubstitutionPicker {...baseProps} volunteers={[]} />);
    expect(screen.getByTestId('declined-pinned')).toHaveTextContent('John D.');
  });

  it('lists only available volunteers (excludes unavailable/partial and self)', () => {
    render(
      <SubstitutionPicker
        {...baseProps}
        volunteers={[
          pv('1', 'Grace Hopper', 'available'),
          pv('2', 'Ada Lovelace', 'unavailable'),
          pv('3', 'Alan Turing', 'partial'),
          pv('declined-1', 'John Doe', 'available'),
        ]}
      />,
    );
    expect(screen.getByText('Grace H.')).toBeVisible();
    expect(screen.queryByText('Ada L.')).not.toBeInTheDocument();
    expect(screen.queryByText('Alan T.')).not.toBeInTheDocument();
    // The declined volunteer is excluded from the candidate list (pinned only).
    expect(screen.getAllByText('John D.')).toHaveLength(1);
  });

  it('filters candidates by search', async () => {
    const user = userEvent.setup();
    render(
      <SubstitutionPicker
        {...baseProps}
        volunteers={[
          pv('1', 'Grace Hopper', 'available'),
          pv('2', 'Margaret Hamilton', 'available'),
        ]}
      />,
    );
    await user.type(screen.getByPlaceholderText(/search available/i), 'grace');
    expect(screen.getByText('Grace H.')).toBeVisible();
    expect(screen.queryByText('Margaret H.')).not.toBeInTheDocument();
  });

  it('calls onSelect with the chosen volunteer id', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <SubstitutionPicker
        {...baseProps}
        onSelect={onSelect}
        volunteers={[pv('vol-9', 'Grace Hopper', 'available')]}
      />,
    );
    await user.click(screen.getByRole('button', { name: /grace h/i }));
    expect(onSelect).toHaveBeenCalledWith('vol-9');
  });

  it('shows the empty state when no candidate is available', () => {
    render(
      <SubstitutionPicker
        {...baseProps}
        volunteers={[pv('2', 'Ada Lovelace', 'unavailable')]}
      />,
    );
    expect(screen.getByText(/no available volunteers/i)).toBeVisible();
  });

  it('renders a role badge disambiguating the declined volunteer and candidates (FR-013)', () => {
    render(
      <SubstitutionPicker
        {...baseProps}
        declinedVolunteerName="Local Leader"
        declinedVolunteerSystemRole="leader"
        volunteers={[pv('1', 'Local Sub Leader', 'available', 'sub_leader')]}
      />,
    );
    const badges = screen.getAllByTestId('assignee-role-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveTextContent('Leader');
    expect(badges[1]).toHaveTextContent('Sub-leader');
  });
});
