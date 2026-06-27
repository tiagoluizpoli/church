import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type SuggestedVolunteer, SuggestionList } from './suggestion-list';

const make = (
  id: string,
  name: string,
  status: SuggestedVolunteer['status'],
  workloadCount = 0,
): SuggestedVolunteer => ({ id, name, status, workloadCount });

describe('SuggestionList (T118)', () => {
  it('renders "No suggestions" when empty', () => {
    render(<SuggestionList suggestions={[]} onAssign={vi.fn()} />);
    expect(screen.getByText(/no suggestions/i)).toBeVisible();
    expect(screen.queryByTestId('suggestion-list')).not.toBeInTheDocument();
  });

  it('renders at most 3 suggestions', () => {
    const suggestions = [
      make('1', 'A A', 'available'),
      make('2', 'B B', 'available'),
      make('3', 'C C', 'available'),
      make('4', 'D D', 'available'),
    ];
    render(<SuggestionList suggestions={suggestions} onAssign={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /accept/i })).toHaveLength(3);
  });

  it('calls onAssign with the volunteer id when Accept is clicked', async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn();
    render(
      <SuggestionList
        suggestions={[make('vol-1', 'Grace Hopper', 'available')]}
        onAssign={onAssign}
      />,
    );
    await user.click(screen.getByRole('button', { name: /accept/i }));
    expect(onAssign).toHaveBeenCalledWith('vol-1');
  });

  it('de-prioritizes partial-status suggestions with muted styling', () => {
    render(
      <SuggestionList
        suggestions={[make('1', 'Partial P', 'partial')]}
        onAssign={vi.fn()}
      />,
    );
    const item = screen.getByText('Partial P.').closest('li');
    expect(item?.className).toContain('opacity-60');
  });
});
