import { DndContext } from '@dnd-kit/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PoolVolunteer } from '../../hooks/use-volunteer-pool';
import type { AssignableFitTier } from './cycle-builder-matrix.utils';
import { VolunteerPoolSidebar } from './volunteer-pool-sidebar';

function renderSidebar(ui: ReactElement) {
  return render(<DndContext>{ui}</DndContext>);
}

const volunteers: PoolVolunteer[] = [
  { volunteerId: '1', volunteerName: 'Alice Smith', status: 'available' },
  { volunteerId: '2', volunteerName: 'Bob Jones', status: 'available' },
];

const groupableVolunteers: PoolVolunteer[] = [
  {
    volunteerId: '1',
    volunteerName: 'Alice Smith',
    status: 'available',
    qualifiedRoleNames: ['Greeter'],
  },
  {
    volunteerId: '2',
    volunteerName: 'Bob Jones',
    status: 'partial',
    qualifiedRoleNames: ['Greeter', 'Usher'],
  },
  {
    volunteerId: '3',
    volunteerName: 'Carol White',
    status: 'unavailable',
    qualifiedRoleNames: ['Usher'],
  },
  {
    volunteerId: '4',
    volunteerName: 'Dana Brown',
    status: 'no_response',
    qualifiedRoleNames: ['Greeter'],
  },
];

const roles = [
  { id: 'usher', name: 'Usher' },
  { id: 'greeter', name: 'Greeter' },
];

describe('VolunteerPoolSidebar (T102)', () => {
  it('renders all volunteers initially', () => {
    renderSidebar(
      <VolunteerPoolSidebar
        volunteers={volunteers}
        assignments={[]}
        roles={roles}
      />,
    );
    expect(screen.getByText('Alice S.')).toBeVisible();
    expect(screen.getByText('Bob J.')).toBeVisible();
  });

  it('filters by name (case-insensitive)', async () => {
    const user = userEvent.setup();
    renderSidebar(
      <VolunteerPoolSidebar
        volunteers={volunteers}
        assignments={[]}
        roles={roles}
      />,
    );
    await user.type(screen.getByPlaceholderText(/search by name/i), 'alice');
    expect(screen.getByText('Alice S.')).toBeVisible();
    expect(screen.queryByText('Bob J.')).not.toBeInTheDocument();
  });

  it('shows the empty state when no volunteer matches', async () => {
    const user = userEvent.setup();
    renderSidebar(
      <VolunteerPoolSidebar
        volunteers={volunteers}
        assignments={[]}
        roles={roles}
      />,
    );
    await user.type(screen.getByPlaceholderText(/search by name/i), 'zzz');
    expect(screen.getByText(/no volunteers match/i)).toBeVisible();
  });

  it('calls onSelectVolunteer when a volunteer card is clicked', async () => {
    const user = userEvent.setup();
    const onSelectVolunteer = vi.fn();

    renderSidebar(
      <VolunteerPoolSidebar
        volunteers={volunteers}
        assignments={[]}
        roles={roles}
        onSelectVolunteer={onSelectVolunteer}
      />,
    );

    const [firstSelectButton] = screen.getAllByTestId('volunteer-select-slot');
    expect(firstSelectButton).toBeDefined();
    if (!firstSelectButton) {
      throw new Error('Expected a Select slot button in volunteer pool');
    }

    await user.click(firstSelectButton);
    expect(onSelectVolunteer).toHaveBeenCalledWith('1');
  });

  it('promotes a focused requirement’s candidates without hiding the rest of the pool', async () => {
    const user = userEvent.setup();
    const onClearFocus = vi.fn();

    renderSidebar(
      <VolunteerPoolSidebar
        volunteers={volunteers}
        assignments={[]}
        roles={roles}
        focusedVolunteerIds={['2']}
        focusLabel="Greeter · 9:00 AM - 11:00 AM"
        onClearFocus={onClearFocus}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Volunteer list' }),
    ).toBeVisible();
    expect(screen.getByText('Greeter · 9:00 AM - 11:00 AM')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: /^Best for this role/ }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: /^Everyone else/ }),
    ).toBeVisible();

    // Bob is ranked for the focused shift×role, so he is promoted over the
    // pool's own alphabetical order instead of Alice being filtered out.
    const [firstCard] = screen.getAllByTestId('volunteer-card');
    expect(firstCard).toHaveTextContent('Bob J.');
    expect(screen.getByText('Alice S.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'All volunteers' }));
    expect(onClearFocus).toHaveBeenCalledOnce();
  });

  it('offers Pick me on every assignable card, not only the ranked ones', async () => {
    const user = userEvent.setup();
    const onAssignFocusedVolunteer = vi.fn();

    renderSidebar(
      <VolunteerPoolSidebar
        volunteers={volunteers}
        assignments={[]}
        roles={roles}
        focusedVolunteerIds={['2']}
        // Both are assignable — the leader may overrule the ranking and pick
        // Alice even though only Bob was ranked for the role.
        assignableVolunteerFits={
          new Map<string, AssignableFitTier>([
            ['1', 'ready'],
            ['2', 'ready'],
          ])
        }
        focusLabel="Greeter · 9:00 AM - 11:00 AM"
        onSelectVolunteer={vi.fn()}
        onAssignFocusedVolunteer={onAssignFocusedVolunteer}
      />,
    );

    const pickButtons = screen.getAllByTestId('volunteer-pick-me');
    expect(pickButtons).toHaveLength(2);
    expect(
      screen.queryByTestId('volunteer-select-slot'),
    ).not.toBeInTheDocument();

    // Alice (id 1) is under "Everyone else" yet still committable.
    await user.click(pickButtons[pickButtons.length - 1]);
    expect(onAssignFocusedVolunteer).toHaveBeenCalledWith('1');
  });

  it('keeps Select slot on a card excluded from the assignable set', () => {
    renderSidebar(
      <VolunteerPoolSidebar
        volunteers={volunteers}
        assignments={[]}
        roles={roles}
        focusedVolunteerIds={['2']}
        // Only Bob is assignable; Alice (already serving this shift, say) is not.
        assignableVolunteerFits={
          new Map<string, AssignableFitTier>([['2', 'ready']])
        }
        focusLabel="Greeter · 9:00 AM - 11:00 AM"
        onSelectVolunteer={vi.fn()}
        onAssignFocusedVolunteer={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId('volunteer-pick-me')).toHaveLength(1);
    expect(screen.getByTestId('volunteer-select-slot')).toBeVisible();
  });

  it('offers no Pick me action when focus assignment is not wired', () => {
    renderSidebar(
      <VolunteerPoolSidebar
        volunteers={volunteers}
        assignments={[]}
        roles={roles}
        focusedVolunteerIds={['2']}
        assignableVolunteerFits={
          new Map<string, AssignableFitTier>([
            ['1', 'ready'],
            ['2', 'ready'],
          ])
        }
        focusLabel="Greeter · 9:00 AM - 11:00 AM"
      />,
    );

    expect(screen.queryByTestId('volunteer-pick-me')).not.toBeInTheDocument();
  });

  it('still lists the pool when nobody is qualified for the focused role', () => {
    renderSidebar(
      <VolunteerPoolSidebar
        volunteers={volunteers}
        assignments={[]}
        roles={roles}
        focusedVolunteerIds={[]}
        focusLabel="Greeter · 9:00 AM - 11:00 AM"
      />,
    );

    expect(screen.getByText('No candidates for this role')).toBeVisible();
    expect(screen.getByText('Alice S.')).toBeVisible();
    expect(screen.getByText('Bob J.')).toBeVisible();
  });

  it('keeps the focus ranking inside a grouped rail', async () => {
    const user = userEvent.setup();
    renderSidebar(
      <VolunteerPoolSidebar
        volunteers={groupableVolunteers}
        assignments={[]}
        roles={roles}
        focusedVolunteerIds={['4', '2']}
        focusLabel="Greeter · 9:00 AM - 11:00 AM"
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Filter and group volunteers' }),
    );
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'By status' }),
    );

    // Ready first (Alice), then Awaiting — where the focus ranking puts Dana
    // ahead of Bob even though the pool sorts partial above no_response.
    const cards = screen.getAllByTestId('volunteer-card');
    expect(cards[0]).toHaveTextContent('Alice S.');
    expect(cards[1]).toHaveTextContent('Dana B.');
    expect(cards[2]).toHaveTextContent('Bob J.');
  });

  it('groups volunteers by status and keeps unavailable volunteers expandable', async () => {
    const user = userEvent.setup();
    renderSidebar(
      <VolunteerPoolSidebar
        volunteers={groupableVolunteers}
        assignments={[]}
        roles={roles}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Filter and group volunteers' }),
    );
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'By status' }),
    );

    expect(screen.getByText('Ready')).toBeVisible();
    expect(screen.getByText('Awaiting')).toBeVisible();
    expect(screen.getByText('Dana B.')).toBeVisible();
    expect(screen.queryByText('Carol W.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Unavailable (1)' }));
    expect(screen.getByText('Carol W.')).toBeVisible();
  });

  it('filters by qualification and shows a removable filter chip', async () => {
    const user = userEvent.setup();
    renderSidebar(
      <VolunteerPoolSidebar
        volunteers={groupableVolunteers}
        assignments={[]}
        roles={roles}
      />,
    );

    // No chip until a role filter is applied.
    expect(
      screen.queryByTestId('volunteer-role-filter-chip'),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Filter and group volunteers' }),
    );
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'Usher' }),
    );

    // Carol + Bob are Usher-qualified; Alice + Dana (Greeter only) drop out.
    const chip = screen.getByTestId('volunteer-role-filter-chip');
    expect(chip).toHaveTextContent('Usher');
    expect(screen.getByText('Carol W.')).toBeVisible();
    expect(screen.getByText('Bob J.')).toBeVisible();
    expect(screen.queryByText('Alice S.')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Clear Usher filter' }),
    );
    expect(
      screen.queryByTestId('volunteer-role-filter-chip'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Alice S.')).toBeVisible();
  });

  it('groups volunteers by their qualified roles', async () => {
    const user = userEvent.setup();
    renderSidebar(
      <VolunteerPoolSidebar
        volunteers={groupableVolunteers}
        assignments={[]}
        roles={roles}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Filter and group volunteers' }),
    );
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'By role' }),
    );

    expect(screen.getByRole('heading', { name: /^Greeter/ })).toBeVisible();
    expect(screen.getByRole('heading', { name: /^Usher/ })).toBeVisible();
    expect(screen.getAllByText('Bob J.')).toHaveLength(2);
  });
});

describe('VolunteerPoolSidebar qualified roles line (023 phase 6)', () => {
  it('shows a volunteer’s qualified roles under their name, dot-separated', () => {
    renderSidebar(
      <VolunteerPoolSidebar
        volunteers={[
          {
            volunteerId: '1',
            volunteerName: 'Ana Costa',
            status: 'available',
            qualifiedRoleNames: ['Slides', 'Camera'],
          },
        ]}
        assignments={[]}
        roles={roles}
      />,
    );

    expect(screen.getByTestId('volunteer-qualified-roles')).toHaveTextContent(
      'Slides · Camera',
    );
  });

  it('renders no roles line for a volunteer qualified for nothing', () => {
    renderSidebar(
      <VolunteerPoolSidebar
        volunteers={[
          {
            volunteerId: '1',
            volunteerName: 'Ana Costa',
            status: 'available',
            qualifiedRoleNames: [],
          },
        ]}
        assignments={[]}
        roles={roles}
      />,
    );

    expect(
      screen.queryByTestId('volunteer-qualified-roles'),
    ).not.toBeInTheDocument();
  });

  describe('empty states (B-1)', () => {
    it('says the pool is structurally empty when there is nothing to filter', () => {
      renderSidebar(
        <VolunteerPoolSidebar volunteers={[]} assignments={[]} roles={roles} />,
      );

      expect(screen.getByTestId('volunteer-pool-empty')).toHaveTextContent(
        'No volunteers are eligible for this cycle yet.',
      );
      expect(
        screen.queryByRole('button', { name: 'Clear filters' }),
      ).not.toBeInTheDocument();
    });

    it('names the search term and offers a way back when a filter empties the rail', async () => {
      const user = userEvent.setup();
      renderSidebar(
        <VolunteerPoolSidebar
          volunteers={volunteers}
          assignments={[]}
          roles={roles}
        />,
      );

      await user.type(
        screen.getByLabelText('Search volunteers by name'),
        'zzz',
      );
      expect(screen.getByTestId('volunteer-pool-empty')).toHaveTextContent(
        'No volunteers match “zzz”.',
      );

      await user.click(screen.getByRole('button', { name: 'Clear filters' }));
      expect(screen.getByText('Alice S.')).toBeVisible();
    });
  });
});
