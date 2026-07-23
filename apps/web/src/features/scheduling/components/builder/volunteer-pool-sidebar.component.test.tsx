import { DndContext } from '@dnd-kit/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PoolVolunteer } from '../../hooks/use-volunteer-pool';
import { VolunteerPoolSidebar } from './volunteer-pool-sidebar';

function renderSidebar(ui: ReactElement) {
  return render(<DndContext>{ui}</DndContext>);
}

const volunteers: PoolVolunteer[] = [
  { volunteerId: '1', volunteerName: 'Alice Smith', status: 'available' },
  { volunteerId: '2', volunteerName: 'Bob Jones', status: 'available' },
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

    const [firstSelectButton] = screen.getAllByRole('button', {
      name: 'Select slot',
    });
    expect(firstSelectButton).toBeDefined();
    if (!firstSelectButton) {
      throw new Error('Expected a Select slot button in volunteer pool');
    }

    await user.click(firstSelectButton);
    expect(onSelectVolunteer).toHaveBeenCalledWith('1');
  });

  it('scopes the rail to a focused requirement and can restore the full pool', async () => {
    const user = userEvent.setup();
    const onClearFocus = vi.fn();

    renderSidebar(
      <VolunteerPoolSidebar
        volunteers={volunteers}
        assignments={[]}
        roles={roles}
        focusedVolunteerIds={new Set(['1'])}
        focusLabel="Greeter · 9:00 AM - 11:00 AM"
        onClearFocus={onClearFocus}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Candidates' })).toBeVisible();
    expect(screen.getByText('Greeter · 9:00 AM - 11:00 AM')).toBeVisible();
    expect(screen.getByText('Alice S.')).toBeVisible();
    expect(screen.queryByText('Bob J.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All volunteers' }));
    expect(onClearFocus).toHaveBeenCalledOnce();
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
});
