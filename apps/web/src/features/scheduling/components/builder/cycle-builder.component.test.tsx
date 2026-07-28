import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CycleBuilderData } from '../../hooks/use-cycle-builder';
import { CycleBuilder } from './cycle-builder';
import { renderWithProviders } from '@/__tests__/setup/render';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const builderData: CycleBuilderData = {
  assignments: [],
  roles: [{ id: 'role-1', name: 'Greeter' }],
  events: [
    {
      participationId: 'participation-1',
      state: 'rostering',
      eventId: 'event-1',
      title: 'Sunday Gathering',
      startDate: '2026-08-02T09:00:00.000Z',
      endDate: '2026-08-02T11:00:00.000Z',
      status: 'scheduled',
      eventType: 'hourly',
      fillRatio: 0,
      requiredCount: 1,
      assignedCount: 0,
      slotCount: 1,
      slots: [
        {
          slotId: 'slot-1',
          label: 'Morning service',
          startTime: '2026-08-02T09:00:00.000Z',
          endTime: '2026-08-02T11:00:00.000Z',
          included: true,
          requiredCount: 1,
          assignedCount: 0,
          shiftCount: 1,
          shifts: [
            {
              shiftId: 'shift-1',
              slotId: 'slot-1',
              startTime: '2026-08-02T09:00:00.000Z',
              endTime: '2026-08-02T11:00:00.000Z',
              requiredCount: 1,
              assignedCount: 0,
              requirements: [{ roleId: 'role-1', requiredCount: 1 }],
              assignments: [],
              eligibleVolunteerCount: 1,
              eligibleVolunteers: [
                {
                  volunteerId: 'volunteer-1',
                  volunteerName: 'Grace Hopper',
                  isAvailable: true,
                  hasConflict: false,
                  qualifiedRoleIds: ['role-1'],
                  ministryAccessLevel: 'volunteer',
                  leadTeamIds: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

interface RenderBuilderInput {
  createAssignment?: () => Promise<unknown>;
}

function renderBuilder({ createAssignment }: RenderBuilderInput = {}) {
  const mutateAsync = vi.fn(createAssignment ?? (() => Promise.resolve({})));
  renderWithProviders(
    <CycleBuilder
      data={builderData}
      onPublish={vi.fn()}
      isPublishing={false}
      cycleId="cycle-1"
      ministryId="ministry-1"
      cycleName="Agosto 2026"
      cycleStartDate="2026-08-01"
      cycleEndDate="2026-08-31"
      createAssignment={{ isPending: false, mutateAsync }}
      deleteAssignment={{ isPending: false, mutateAsync: vi.fn() }}
      reassignAssignment={{ isPending: false, mutateAsync: vi.fn() }}
    />,
  );
  return { mutateAsync };
}

async function assignGraceHopper() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await user.click(await screen.findByTestId('suggestion-option'));
}

describe('CycleBuilder header (B-4)', () => {
  it('replaces the hero with the cycle, its window, and how much of it is done', () => {
    renderBuilder();

    const header = screen.getByTestId('cycle-builder-header');
    expect(header).toHaveTextContent('Agosto 2026');
    expect(header).toHaveTextContent('Aug 1 – Aug 31, 2026');
    // One shift, one required role, nobody on it yet — read straight off the
    // builder data, so it tracks every write the board applies.
    expect(header).toHaveTextContent('0 of 1 assignments filled');
    expect(header).toHaveTextContent('1 shift is below target');
    // The plain inventory counters Planning and Tailoring also carry.
    expect(screen.getByTestId('cycle-builder-event-count')).toHaveTextContent(
      '1',
    );
    expect(screen.getByTestId('cycle-builder-slot-count')).toHaveTextContent(
      '1',
    );
    expect(screen.getByTestId('cycle-builder-shift-count')).toHaveTextContent(
      '1',
    );
    expect(
      screen.getByTestId('cycle-builder-assigned-count'),
    ).toHaveTextContent('0');
    expect(
      screen.queryByText(/Map the cycle, then place with confidence/),
    ).not.toBeInTheDocument();
  });
});

describe('CycleBuilder assignment announcements (B-3)', () => {
  it('announces a saved assignment in a live region, not only in a toast', async () => {
    renderBuilder();

    const announcer = screen.getByTestId('cycle-builder-announcer');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(announcer).toHaveTextContent('');

    await assignGraceHopper();

    // Sonner renders away from the board a screen-reader user is on, so the
    // only signal a write landed used to be visual.
    await waitFor(() =>
      expect(announcer).toHaveTextContent(
        'Assigned Grace Hopper to Morning service',
      ),
    );
  });

  it('announces a rejected assignment, naming the person and the slot', async () => {
    renderBuilder({
      createAssignment: () => Promise.reject(new Error('Volunteer is booked')),
    });

    await assignGraceHopper();

    await waitFor(() =>
      expect(screen.getByTestId('cycle-builder-announcer')).toHaveTextContent(
        'Could not assign Grace Hopper to Morning service: Volunteer is booked',
      ),
    );
  });
});
