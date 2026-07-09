import { DndContext } from '@dnd-kit/core';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleBuilderData } from '../../hooks/use-schedule-builder';
import { BuilderGrid } from './builder-grid';
import { renderWithProviders } from '@/__tests__/setup/render';

// One slot, one role requiring one volunteer, no assignments → one empty cell
// whose SuggestionList exercises the derivation in builder-grid. Branded IDs in
// the inferred type are plain strings over the wire, so this test fixture is
// built with string literals and cast once.
const data = {
  event: {
    id: 'e1',
    title: 'Service',
    startDate: '2026-05-10T09:00:00.000Z',
    endDate: '2026-05-10T11:00:00.000Z',
    ministryId: 'm1',
    status: 'draft',
    eventType: 'hourly',
  },
  roles: [{ id: 'r1', name: 'Usher' }],
  slots: [
    {
      id: 's1',
      startTime: '2026-05-10T09:00:00.000Z',
      endTime: '2026-05-10T11:00:00.000Z',
      label: 'Morning',
    },
  ],
  requirements: [
    { id: 'req1', slotId: 's1', roleId: 'r1', requiredCount: 1, teamId: null },
  ],
  assignments: [],
  volunteerAvailability: [
    { volunteerId: 'v1', volunteerName: 'Anna', status: 'AVAILABLE' },
    { volunteerId: 'v2', volunteerName: 'Bella', status: 'AVAILABLE' },
    { volunteerId: 'v3', volunteerName: 'Cara', status: 'AVAILABLE' },
    { volunteerId: 'v4', volunteerName: 'Busy', status: 'UNAVAILABLE' },
  ],
  callerTeamId: null,
} as unknown as ScheduleBuilderData;

const handlers = {
  onAssign: vi.fn(),
  onRemove: vi.fn(),
  onOverride: vi.fn(),
  onSubstitute: vi.fn(),
  onIncrement: vi.fn(),
  onDecrement: vi.fn(),
  onEditSlot: vi.fn(),
  onDeleteSlot: vi.fn(),
  onAddSlot: vi.fn(),
};

describe('BuilderGrid suggestion derivation (T117)', () => {
  it('suggests available volunteers and excludes unavailable ones', () => {
    renderWithProviders(
      <DndContext>
        <BuilderGrid data={data} callerTeamId={null} {...handlers} />
      </DndContext>,
    );
    const list = screen.getByTestId('suggestion-list');
    expect(within(list).getByText('Anna')).toBeVisible();
    expect(within(list).getByText('Bella')).toBeVisible();
    expect(within(list).queryByText('Busy')).not.toBeInTheDocument();
  });

  it('caps suggestions at three', () => {
    renderWithProviders(
      <DndContext>
        <BuilderGrid data={data} callerTeamId={null} {...handlers} />
      </DndContext>,
    );
    const list = screen.getByTestId('suggestion-list');
    expect(
      within(list).getAllByRole('button', { name: /accept/i }),
    ).toHaveLength(3);
  });

  it('renders the slot row Delete action with destructive styling, distinct from Edit', () => {
    renderWithProviders(
      <DndContext>
        <BuilderGrid data={data} callerTeamId={null} {...handlers} />
      </DndContext>,
    );
    const row = screen.getByTestId('slot-row');

    expect(
      within(row).getByRole('button', { name: 'Delete slot' }),
    ).toHaveClass('text-destructive');
    expect(
      within(row).getByRole('button', { name: 'Edit slot' }),
    ).not.toHaveClass('text-destructive');
  });
});
