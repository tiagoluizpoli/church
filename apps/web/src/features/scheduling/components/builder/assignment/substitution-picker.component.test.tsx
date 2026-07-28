import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PickerVolunteer } from '../../../utils/builder/cycle-builder-candidate.types';
import { SubstitutionPicker } from './substitution-picker';

function pv(overrides: Partial<PickerVolunteer>): PickerVolunteer {
  return {
    id: 'volunteer-1',
    name: 'Volunteer',
    availabilityStatus: 'available',
    alreadyAssignedCount: 0,
    ...overrides,
  };
}

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
          pv({
            id: '1',
            name: 'Grace Hopper',
            availabilityStatus: 'available',
          }),
          pv({
            id: '2',
            name: 'Ada Lovelace',
            availabilityStatus: 'unavailable',
          }),
          pv({ id: '3', name: 'Alan Turing', availabilityStatus: 'partial' }),
          pv({
            id: 'declined-1',
            name: 'John Doe',
            availabilityStatus: 'available',
          }),
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
          pv({
            id: '1',
            name: 'Grace Hopper',
            availabilityStatus: 'available',
          }),
          pv({
            id: '2',
            name: 'Margaret Hamilton',
            availabilityStatus: 'available',
          }),
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
        volunteers={[
          pv({
            id: 'vol-9',
            name: 'Grace Hopper',
            availabilityStatus: 'available',
          }),
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: /grace h/i }));
    expect(onSelect).toHaveBeenCalledWith('vol-9');
  });

  it('shows the empty state when no candidate is available', () => {
    render(
      <SubstitutionPicker
        {...baseProps}
        volunteers={[
          pv({
            id: '2',
            name: 'Ada Lovelace',
            availabilityStatus: 'unavailable',
          }),
        ]}
      />,
    );
    expect(screen.getByText(/no available volunteers/i)).toBeVisible();
  });

  it('renders a role badge disambiguating the declined volunteer and candidates (FR-013)', () => {
    render(
      <SubstitutionPicker
        {...baseProps}
        declinedVolunteerName="Local Leader"
        declinedVolunteerMembership={{
          ministryAccessLevel: 'leader',
          leadTeamIds: [],
        }}
        volunteers={[
          pv({
            id: '1',
            name: 'Local Team Leader',
            availabilityStatus: 'available',
            membership: {
              ministryAccessLevel: 'volunteer',
              leadTeamIds: ['team-a'],
            },
          }),
        ]}
        contextTeamId="team-a"
      />,
    );
    const badges = screen.getAllByTestId('assignee-role-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveTextContent('Leader');
    expect(badges[1]).toHaveTextContent('Team Leader');
  });

  it("shows no Team Leader badge for a candidate whose team leadership is outside this picker's team context (regression guard)", () => {
    render(
      <SubstitutionPicker
        {...baseProps}
        volunteers={[
          pv({
            id: '1',
            name: 'Local Team Leader',
            availabilityStatus: 'available',
            membership: {
              ministryAccessLevel: 'volunteer',
              leadTeamIds: ['team-a'],
            },
          }),
        ]}
        contextTeamId="team-b"
      />,
    );
    expect(screen.queryByTestId('assignee-role-badge')).not.toBeInTheDocument();
  });
});
