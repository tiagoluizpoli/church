import { parseInstant, resetClock, setTestClock } from '@church/time';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/__tests__/setup/render';
import { CycleBuilder } from '@/features/scheduling/components/builder/cycle-builder';
import type { CycleBuilderData } from '@/features/scheduling/hooks/use-cycle-builder';

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
      start: '2026-08-02T09:00:00.000Z',
      end: '2026-08-02T11:00:00.000Z',
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

const existingAssignment = {
  id: 'assignment-1',
  churchId: 'church-1',
  slotId: 'slot-1',
  participationId: 'participation-1',
  shiftId: 'shift-1',
  volunteerId: 'volunteer-1',
  roleId: 'role-1',
  status: 'confirmed',
  assignedAt: '2026-07-01T10:00:00.000Z',
  volunteerName: 'Grace Hopper',
} as const;

interface TeamGuardDataInput {
  requirementTeamId: string;
  start?: string;
  state?: string;
  canMutateAssignments?: boolean;
}

function teamGuardData({
  requirementTeamId,
  start,
  state,
  canMutateAssignments,
}: TeamGuardDataInput): CycleBuilderData {
  const event = builderData.events[0];
  const slot = event.slots[0];
  const shift = slot.shifts[0];
  return {
    ...builderData,
    assignments: [existingAssignment],
    events: [
      {
        ...event,
        start: start ?? event.start,
        state: state ?? event.state,
        assignedCount: 1,
        slots: [
          {
            ...slot,
            assignedCount: 1,
            shifts: [
              {
                ...shift,
                requiredCount: 2,
                assignedCount: 1,
                requirements: [
                  {
                    ...shift.requirements[0],
                    requiredCount: 2,
                    teamId: requirementTeamId,
                    canMutateAssignments:
                      canMutateAssignments ?? requirementTeamId === 'team-1',
                  },
                ],
                assignments: [existingAssignment],
                eligibleVolunteers: shift.eligibleVolunteers.map(
                  (volunteer) => ({ ...volunteer }),
                ),
              },
            ],
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  setTestClock({
    instant: parseInstant({ value: '2026-08-01T12:00:00.000Z' }),
  });
});

afterEach(() => resetClock());

interface RenderBuilderInput {
  createAssignment?: () => Promise<unknown>;
  data?: CycleBuilderData;
  teamId?: string;
}

function renderBuilder({
  createAssignment,
  data = builderData,
  teamId,
}: RenderBuilderInput = {}) {
  const mutateAsync = vi.fn(createAssignment ?? (() => Promise.resolve({})));
  renderWithProviders(
    <CycleBuilder
      data={data}
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
      teamId={teamId}
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
    expect(header).toHaveTextContent('01/08 – 31/08/2026');
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

describe('CycleBuilder TeamLeader affordances (#200)', () => {
  it('allows assignment in a future rostering cell for the led Team, without ministry-wide controls', async () => {
    const data: CycleBuilderData = {
      ...builderData,
      events: builderData.events.map((event) => ({
        ...event,
        slots: event.slots.map((slot) => ({
          ...slot,
          shifts: slot.shifts.map((shift) => ({
            ...shift,
            requirements: shift.requirements.map((requirement) => ({
              ...requirement,
              teamId: 'team-1',
            })),
          })),
        })),
      })),
    };
    const { mutateAsync } = renderBuilder({ data, teamId: 'team-1' });

    expect(
      screen.queryByRole('button', { name: 'Publish cycle' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Audit log' }),
    ).not.toBeInTheDocument();

    await assignGraceHopper();

    expect(mutateAsync).toHaveBeenCalledWith({
      shiftId: 'shift-1',
      body: { volunteerId: 'volunteer-1', roleId: 'role-1' },
    });
  });

  it('allows remove and reassign affordances in a future rostering cell for the led Team', async () => {
    const user = userEvent.setup();
    const data = teamGuardData({ requirementTeamId: 'team-1' });
    data.events[0].slots[0].shifts[0].eligibleVolunteers.push({
      volunteerId: 'volunteer-2',
      volunteerName: 'Ada Lovelace',
      isAvailable: true,
      hasConflict: false,
      qualifiedRoleIds: ['role-1'],
      ministryAccessLevel: 'volunteer',
      leadTeamIds: [],
    });
    renderBuilder({ data, teamId: 'team-1' });

    expect(
      screen.getByTestId('cycle-requirement-shift-1-role-1'),
    ).toHaveAttribute('data-drop-target', 'append');
    expect(
      screen.getByTestId('cycle-assignment-assignment-1'),
    ).not.toHaveAttribute('data-drop-target');

    await user.click(screen.getByTestId('assignment-chip'));

    expect(screen.getByRole('button', { name: 'Unassign' })).toBeVisible();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it("keeps another Team's cell readable but immutable", async () => {
    const user = userEvent.setup();
    renderBuilder({
      data: teamGuardData({ requirementTeamId: 'team-2' }),
      teamId: 'team-1',
    });

    const cell = screen.getByTestId('cycle-requirement-shift-1-role-1');
    expect(cell).toBeVisible();
    expect(cell).not.toHaveAttribute('data-drop-target');
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();

    const assignment = screen.getByTestId('cycle-assignment-assignment-1');
    expect(assignment).not.toHaveAttribute('data-drop-target');
    await user.click(screen.getByTestId('assignment-chip'));
    expect(screen.queryByTestId('assignment-picker')).toBeNull();

    expect(screen.queryByTestId('volunteer-select-slot')).toBeNull();
    for (const grip of screen.getAllByTestId('volunteer-card-grip')) {
      expect(grip).toBeDisabled();
    }
  });

  it('keeps a started event immutable for its TeamLeader', () => {
    renderBuilder({
      data: teamGuardData({
        requirementTeamId: 'team-1',
        start: '2026-08-01T12:00:00.000Z',
        canMutateAssignments: false,
      }),
      teamId: 'team-1',
    });

    expect(
      screen.getByTestId('cycle-requirement-shift-1-role-1'),
    ).not.toHaveAttribute('data-drop-target');
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(screen.queryByTestId('volunteer-select-slot')).toBeNull();
    for (const grip of screen.getAllByTestId('volunteer-card-grip')) {
      expect(grip).toBeDisabled();
    }
  });

  it('keeps a published participation immutable for its TeamLeader', () => {
    renderBuilder({
      data: teamGuardData({
        requirementTeamId: 'team-1',
        state: 'published',
        canMutateAssignments: false,
      }),
      teamId: 'team-1',
    });

    expect(
      screen.getByTestId('cycle-requirement-shift-1-role-1'),
    ).not.toHaveAttribute('data-drop-target');
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(screen.queryByTestId('volunteer-select-slot')).toBeNull();
    for (const grip of screen.getAllByTestId('volunteer-card-grip')) {
      expect(grip).toBeDisabled();
    }
  });

  it('does not turn rail picks into writes when a readable unled-Team cell is focused', async () => {
    const user = userEvent.setup();
    const data = teamGuardData({ requirementTeamId: 'team-2' });
    const shift = data.events[0].slots[0].shifts[0];
    shift.requirements.push({
      roleId: 'role-2',
      teamId: 'team-1',
      requiredCount: 1,
    });
    shift.eligibleVolunteers.push({
      volunteerId: 'volunteer-2',
      volunteerName: 'Ada Lovelace',
      isAvailable: true,
      hasConflict: false,
      qualifiedRoleIds: ['role-1', 'role-2'],
      ministryAccessLevel: 'volunteer',
      leadTeamIds: [],
    });
    data.roles.push({ id: 'role-2', name: 'Host' });

    renderBuilder({ data, teamId: 'team-1' });

    await user.click(
      screen.getByRole('button', {
        name: 'Show volunteers for Greeter first',
      }),
    );

    expect(screen.queryByTestId('volunteer-pick-me')).toBeNull();
    expect(screen.getAllByTestId('volunteer-select-slot')).not.toHaveLength(0);

    await user.click(
      screen.getByRole('button', { name: 'Show volunteers for Host first' }),
    );
    expect(screen.getByTestId('volunteer-pick-me')).toBeVisible();
  });

  it('preserves the admin board affordances across Team, time, and participation state', () => {
    renderBuilder({
      data: teamGuardData({
        requirementTeamId: 'team-2',
        start: '2026-08-01T12:00:00.000Z',
        state: 'published',
        canMutateAssignments: true,
      }),
    });

    expect(screen.getByRole('button', { name: 'Publish cycle' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Audit log' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add' })).toBeVisible();
    expect(
      screen.getByTestId('cycle-requirement-shift-1-role-1'),
    ).toHaveAttribute('data-drop-target', 'append');
    expect(screen.getByTestId('cycle-assignment-assignment-1')).toHaveAttribute(
      'data-drop-target',
      'replace',
    );
    expect(screen.getAllByTestId('volunteer-select-slot')).not.toHaveLength(0);
    for (const grip of screen.getAllByTestId('volunteer-card-grip')) {
      expect(grip).not.toBeDisabled();
    }
  });
});
