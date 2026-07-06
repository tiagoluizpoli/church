import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VolunteerCard } from './volunteer-card';
import type { VolunteerPoolItem } from '@/features/scheduling/hooks/use-volunteer-pool';

function buildVolunteer(
  overrides: Partial<VolunteerPoolItem>,
): VolunteerPoolItem {
  return {
    volunteerId: 'volunteer-1',
    volunteerName: 'Local Leader',
    status: 'available',
    workloadCount: 0,
    ...overrides,
  };
}

describe('VolunteerCard (T048)', () => {
  it('renders a role badge distinguishing a Leader from a Sub-leader who truncate identically', () => {
    render(
      <div>
        <VolunteerCard
          volunteer={buildVolunteer({
            volunteerId: 'leader-1',
            volunteerName: 'Local Leader',
            systemRole: 'leader',
          })}
        />
        <VolunteerCard
          volunteer={buildVolunteer({
            volunteerId: 'sub-leader-1',
            volunteerName: 'Local Sub Leader',
            systemRole: 'sub_leader',
          })}
        />
      </div>,
    );

    expect(screen.getAllByText('Local L.')).toHaveLength(2);

    const badges = screen.getAllByTestId('assignee-role-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveTextContent('Leader');
    expect(badges[1]).toHaveTextContent('Sub-leader');
  });

  it('renders no role badge for a plain volunteer', () => {
    render(
      <VolunteerCard volunteer={buildVolunteer({ systemRole: 'volunteer' })} />,
    );

    expect(screen.queryByTestId('assignee-role-badge')).not.toBeInTheDocument();
  });

  it('renders no role badge when systemRole is not provided', () => {
    render(<VolunteerCard volunteer={buildVolunteer({})} />);

    expect(screen.queryByTestId('assignee-role-badge')).not.toBeInTheDocument();
  });

  it('gives the draggable card an accessible name that includes the role, not just the truncated visible text (FR-013)', () => {
    render(
      <div>
        <VolunteerCard
          volunteer={buildVolunteer({
            volunteerId: 'leader-1',
            volunteerName: 'Local Leader',
            systemRole: 'leader',
          })}
        />
        <VolunteerCard
          volunteer={buildVolunteer({
            volunteerId: 'sub-leader-1',
            volunteerName: 'Local Sub Leader',
            systemRole: 'sub_leader',
          })}
        />
      </div>,
    );

    const cards = screen.getAllByTestId('volunteer-card');
    expect(cards[0]).toHaveAccessibleName('Local Leader, Leader');
    expect(cards[1]).toHaveAccessibleName('Local Sub Leader, Sub-leader');
  });

  it('leaves the accessible name as the visible truncated text for a plain volunteer (no role to disambiguate)', () => {
    render(
      <VolunteerCard
        volunteer={buildVolunteer({
          volunteerName: 'John Doe',
          systemRole: 'volunteer',
        })}
      />,
    );

    expect(screen.getByTestId('volunteer-card')).toHaveAccessibleName(
      'John D.',
    );
  });
});
