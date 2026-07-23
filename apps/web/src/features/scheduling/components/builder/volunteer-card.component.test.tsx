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

function noop() {
  // Presence of onSelect is what mounts the Select-slot button; the click
  // target itself is exercised by the sidebar tests.
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

  it('gives the drag grip an accessible name that includes the role, not just the truncated visible text (FR-013)', () => {
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

    const grips = screen.getAllByTestId('volunteer-card-grip');
    expect(grips[0]).toHaveAccessibleName('Local Leader, Leader');
    expect(grips[1]).toHaveAccessibleName('Local Sub Leader, Sub-leader');
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

    expect(screen.getByTestId('volunteer-card-grip')).toHaveAccessibleName(
      'John D.',
    );
  });

  it('renders the recency block as two separate facts, with a never-served fallback', () => {
    render(<VolunteerCard volunteer={buildVolunteer({ workloadCount: 2 })} />);

    expect(screen.getByText('never served')).toBeInTheDocument();
    expect(screen.getByText('2 this cycle')).toBeInTheDocument();
  });

  it('reports how long ago the volunteer last served', () => {
    const fiveWeeksAgo = new Date(
      Date.now() - 35 * 24 * 60 * 60 * 1000,
    ).toISOString();

    render(
      <VolunteerCard
        volunteer={buildVolunteer({ lastServedAt: fiveWeeksAgo })}
      />,
    );

    expect(screen.getByText('last served 5 weeks ago')).toBeInTheDocument();
  });

  it('badges only the ideal pick', () => {
    render(
      <div>
        <VolunteerCard
          volunteer={buildVolunteer({ volunteerId: 'ideal-1' })}
          isIdeal
        />
        <VolunteerCard volunteer={buildVolunteer({ volunteerId: 'other-1' })} />
      </div>,
    );

    expect(screen.getAllByTestId('volunteer-ideal-badge')).toHaveLength(1);
  });

  it('exposes the Select-slot button as a pressed toggle when selected', () => {
    render(
      <VolunteerCard
        volunteer={buildVolunteer({})}
        isSelected
        onSelect={noop}
      />,
    );

    const button = screen.getByRole('button', { name: 'Selected' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('drops the grip in overlay mode so the drag ghost carries no second drag target', () => {
    render(<VolunteerCard volunteer={buildVolunteer({})} isOverlay />);

    expect(screen.queryByTestId('volunteer-card-grip')).not.toBeInTheDocument();
  });
});
