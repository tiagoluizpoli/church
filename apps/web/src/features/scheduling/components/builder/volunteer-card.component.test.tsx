import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

  it('hides the pointer-only drag grip from assistive tech instead of announcing a keyboard drag that does not exist (B-3)', () => {
    render(<VolunteerCard volunteer={buildVolunteer({})} onSelect={noop} />);

    // dnd-kit registers no KeyboardSensor, and its `{...attributes}` announce
    // "to pick up a draggable item, press the space bar". Spreading them here
    // made the accessibility layer promise a gesture that never fires.
    const grip = screen.getByTestId('volunteer-card-grip');
    expect(grip).toHaveAttribute('aria-hidden', 'true');
    expect(grip).toHaveAttribute('tabindex', '-1');
    expect(grip).not.toHaveAttribute('aria-roledescription');
    expect(grip).not.toHaveAttribute('aria-describedby');
  });

  it('names the keyboard action after the volunteer, with the role, not just the truncated visible text (FR-013)', () => {
    render(
      <div>
        <VolunteerCard
          volunteer={buildVolunteer({
            volunteerId: 'leader-1',
            volunteerName: 'Local Leader',
            systemRole: 'leader',
          })}
          onSelect={noop}
        />
        <VolunteerCard
          volunteer={buildVolunteer({
            volunteerId: 'sub-leader-1',
            volunteerName: 'Local Sub Leader',
            systemRole: 'sub_leader',
          })}
          onSelect={noop}
        />
      </div>,
    );

    const actions = screen.getAllByTestId('volunteer-select-slot');
    expect(actions[0]).toHaveAccessibleName(
      'Select Local Leader, Leader to place on a slot',
    );
    expect(actions[1]).toHaveAccessibleName(
      'Select Local Sub Leader, Sub-leader to place on a slot',
    );
  });

  it('falls back to the full name when there is no role to disambiguate', () => {
    render(
      <VolunteerCard
        volunteer={buildVolunteer({
          volunteerName: 'John Doe',
          systemRole: 'volunteer',
        })}
        onSelect={noop}
      />,
    );

    expect(screen.getByTestId('volunteer-select-slot')).toHaveAccessibleName(
      'Select John Doe to place on a slot',
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

    const button = screen.getByTestId('volunteer-select-slot');
    expect(button).toHaveTextContent('Selected');
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('drops the grip in overlay mode so the drag ghost carries no second drag target', () => {
    render(<VolunteerCard volunteer={buildVolunteer({})} isOverlay />);

    expect(screen.queryByTestId('volunteer-card-grip')).not.toBeInTheDocument();
  });

  it('swaps Select slot for Pick me while a slot is focused and this card is assignable', async () => {
    const onAssignToFocused = vi.fn();
    const onSelect = vi.fn();
    render(
      <VolunteerCard
        volunteer={buildVolunteer({})}
        onSelect={onSelect}
        assignFit="ready"
        onAssignToFocused={onAssignToFocused}
      />,
    );

    expect(
      screen.queryByTestId('volunteer-select-slot'),
    ).not.toBeInTheDocument();
    const pickMe = screen.getByTestId('volunteer-pick-me');
    expect(pickMe).toHaveTextContent('Pick me');
    await userEvent.click(pickMe);

    expect(onAssignToFocused).toHaveBeenCalledWith('volunteer-1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('warns on Pick me when availability will demand a reason', () => {
    render(
      <VolunteerCard
        volunteer={buildVolunteer({})}
        onSelect={noop}
        assignFit="override"
        onAssignToFocused={vi.fn()}
      />,
    );

    // The rail must not present the riskiest pick as the frictionless one:
    // the reason is coming either way, so the button says so beforehand.
    const pickMe = screen.getByTestId('volunteer-pick-me');
    expect(pickMe).toHaveAttribute('data-assign-fit', 'override');
    expect(pickMe).toHaveAccessibleName(
      'Assign Local Leader to this role — not available for this shift, needs an override reason',
    );
  });

  it('keeps Select slot when the card is not assignable to the focused slot', () => {
    render(
      <VolunteerCard
        volunteer={buildVolunteer({})}
        onSelect={noop}
        onAssignToFocused={vi.fn()}
      />,
    );

    expect(screen.getByTestId('volunteer-select-slot')).toBeVisible();
    expect(screen.queryByTestId('volunteer-pick-me')).not.toBeInTheDocument();
  });
});
