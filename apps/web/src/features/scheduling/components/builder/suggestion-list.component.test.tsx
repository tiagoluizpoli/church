import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type SuggestedVolunteer, SuggestionList } from './suggestion-list';

const make = (
  id: string,
  name: string,
  status: SuggestedVolunteer['status'],
  workloadCount = 0,
  systemRole?: SuggestedVolunteer['systemRole'],
): SuggestedVolunteer => ({ id, name, status, workloadCount, systemRole });

describe('SuggestionList (T118)', () => {
  it('renders "No suggestions" when empty', () => {
    render(<SuggestionList suggestions={[]} onAssign={vi.fn()} />);
    expect(screen.getByText(/no suggestions/i)).toBeVisible();
    expect(screen.queryByTestId('suggestion-list')).not.toBeInTheDocument();
  });

  it('renders up to 5 suggestions', () => {
    const suggestions = [
      make('1', 'A A', 'available'),
      make('2', 'B B', 'available'),
      make('3', 'C C', 'available'),
      make('4', 'D D', 'available'),
    ];
    render(<SuggestionList suggestions={suggestions} onAssign={vi.fn()} />);
    expect(screen.getAllByTestId('suggestion-option')).toHaveLength(4);
  });

  it('calls onAssign when a candidate row is clicked', async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn();
    render(
      <SuggestionList
        suggestions={[make('vol-1', 'Grace Hopper', 'available')]}
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
      make(`${index}`, `Volunteer ${index}`, 'available'),
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
          make('5', 'Volunteer 5', 'available'),
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
          make('available', 'Available Person', 'available'),
          make('response', 'Waiting Person', 'needs_response'),
          make('conflict', 'Conflict Person', 'conflict'),
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
        suggestions={[make('1', 'Partial P', 'partial')]}
        onAssign={vi.fn()}
      />,
    );
    const status = screen.getByTestId('suggestion-status-partial');
    expect(status).toHaveTextContent('Partial availability');
    expect(status).toHaveClass('bg-yellow-500/10');
  });

  it('renders a role badge disambiguating a Leader and a Sub-leader suggestion (FR-013)', () => {
    render(
      <SuggestionList
        suggestions={[
          make('1', 'Local Leader', 'available', 0, 'leader'),
          make('2', 'Local Sub Leader', 'available', 0, 'sub_leader'),
        ]}
        onAssign={vi.fn()}
      />,
    );
    const badges = screen.getAllByTestId('assignee-role-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveTextContent('Leader');
    expect(badges[1]).toHaveTextContent('Sub-leader');
  });
});
