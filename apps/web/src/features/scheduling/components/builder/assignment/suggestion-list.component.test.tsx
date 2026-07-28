import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SuggestedVolunteer } from '../../../utils/builder/cycle-builder-candidate.types';
import { SuggestionList } from './suggestion-list';

function make(overrides: Partial<SuggestedVolunteer>): SuggestedVolunteer {
  return {
    id: 'volunteer-1',
    name: 'Volunteer',
    status: 'available',
    workloadCount: 0,
    ...overrides,
  };
}

describe('SuggestionList (T118)', () => {
  it('renders "No suggestions" when empty', () => {
    render(<SuggestionList suggestions={[]} onAssign={vi.fn()} />);
    expect(screen.getByText(/no suggestions/i)).toBeVisible();
    expect(screen.queryByTestId('suggestion-list')).not.toBeInTheDocument();
  });

  it('renders up to 5 suggestions', () => {
    const suggestions = [
      make({ id: '1', name: 'A A', status: 'available' }),
      make({ id: '2', name: 'B B', status: 'available' }),
      make({ id: '3', name: 'C C', status: 'available' }),
      make({ id: '4', name: 'D D', status: 'available' }),
    ];
    render(<SuggestionList suggestions={suggestions} onAssign={vi.fn()} />);
    expect(screen.getAllByTestId('suggestion-option')).toHaveLength(4);
  });

  it('calls onAssign when a candidate row is clicked', async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn();
    render(
      <SuggestionList
        suggestions={[
          make({ id: 'vol-1', name: 'Grace Hopper', status: 'available' }),
        ]}
        onAssign={onAssign}
      />,
    );
    await user.click(screen.getByTestId('suggestion-option'));
    expect(onAssign).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'vol-1' }),
    );
  });

  it('shows More candidates only beyond the five directly visible recommendations', () => {
    const fiveSuggestions = Array.from({ length: 5 }, (_, index) =>
      make({ id: `${index}`, name: `Volunteer ${index}`, status: 'available' }),
    );
    const { rerender } = render(
      <SuggestionList
        suggestions={fiveSuggestions}
        highlightTop
        onAssign={vi.fn()}
      />,
    );

    expect(
      screen
        .getAllByTestId('suggestion-option')
        .filter((option) => option.closest('details') === null),
    ).toHaveLength(5);
    expect(screen.queryByText(/More candidates/i)).not.toBeInTheDocument();

    rerender(
      <SuggestionList
        suggestions={[
          ...fiveSuggestions,
          make({ id: '5', name: 'Volunteer 5', status: 'available' }),
        ]}
        highlightTop
        onAssign={vi.fn()}
      />,
    );

    expect(
      screen
        .getAllByTestId('suggestion-option')
        .filter((option) => option.closest('details') === null),
    ).toHaveLength(5);
    expect(screen.getByText('More candidates (1)')).toBeVisible();
  });

  it('uses a semantic availability treatment with a visible label', () => {
    render(
      <SuggestionList
        suggestions={[
          make({
            id: 'available',
            name: 'Available Person',
            status: 'available',
          }),
          make({
            id: 'response',
            name: 'Waiting Person',
            status: 'needs_response',
          }),
          make({ id: 'conflict', name: 'Conflict Person', status: 'conflict' }),
        ]}
        onAssign={vi.fn()}
      />,
    );

    expect(screen.getByTestId('suggestion-status-available')).toHaveTextContent(
      'Available',
    );
    expect(
      screen.getByTestId('suggestion-status-needs_response'),
    ).toHaveTextContent('Needs response');
    expect(screen.getByTestId('suggestion-status-conflict')).toHaveTextContent(
      'Override required',
    );
  });

  it('uses an amber availability treatment for partial suggestions', () => {
    render(
      <SuggestionList
        suggestions={[make({ id: '1', name: 'Partial P', status: 'partial' })]}
        onAssign={vi.fn()}
      />,
    );
    const status = screen.getByTestId('suggestion-status-partial');
    expect(status).toHaveTextContent('Partial availability');
    expect(status).toHaveClass('bg-yellow-500/10');
  });

  it('renders a role badge disambiguating a ministry Leader and a Team Leader suggestion in their own team context (FR-013)', () => {
    render(
      <SuggestionList
        suggestions={[
          make({
            id: '1',
            name: 'Local Leader',
            status: 'available',
            membership: { ministryAccessLevel: 'leader', leadTeamIds: [] },
          }),
          make({
            id: '2',
            name: 'Local Team Leader',
            status: 'available',
            membership: {
              ministryAccessLevel: 'volunteer',
              leadTeamIds: ['team-a'],
            },
          }),
        ]}
        onAssign={vi.fn()}
        contextTeamId="team-a"
      />,
    );
    const badges = screen.getAllByTestId('assignee-role-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveTextContent('Leader');
    expect(badges[1]).toHaveTextContent('Team Leader');
  });

  it('does not badge a suggestion as Team Leader outside their own team context (regression guard)', () => {
    render(
      <SuggestionList
        suggestions={[
          make({
            id: '1',
            name: 'Local Team Leader',
            status: 'available',
            membership: {
              ministryAccessLevel: 'volunteer',
              leadTeamIds: ['team-a'],
            },
          }),
        ]}
        onAssign={vi.fn()}
        contextTeamId="team-b"
      />,
    );
    expect(screen.queryByTestId('assignee-role-badge')).not.toBeInTheDocument();
  });
});
