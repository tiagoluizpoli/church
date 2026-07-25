import { describe, expect, it } from 'vitest';
import {
  addOptimisticAssignment,
  type CycleBuilderQueryData,
  createOptimisticAssignmentId,
  isOptimisticAssignmentId,
  removeOptimisticAssignment,
  replaceOptimisticAssignmentVolunteer,
} from './use-cycle-builder.optimistic';
import type { GetCycleBuilderData200EventsItemSlotsItemShiftsItemAssignmentsItem } from '@/infrastructure/api/churchAPI.schemas';

type RawAssignment =
  GetCycleBuilderData200EventsItemSlotsItemShiftsItemAssignmentsItem;

interface MakeDataInput {
  assignments: RawAssignment[];
}

const EXISTING_ASSIGNMENT: RawAssignment = {
  id: 'assignment-1',
  churchId: 'church-1',
  slotId: 'slot-1',
  participationId: 'participation-1',
  shiftId: 'shift-1',
  volunteerId: 'ana',
  roleId: 'role-1',
  status: 'confirmed',
  assignedAt: '2026-07-01T10:00:00.000Z',
};

function makeData({ assignments }: MakeDataInput): CycleBuilderQueryData {
  return {
    roles: [{ id: 'role-1', name: 'Sound' }],
    events: [
      {
        participation: {
          id: 'participation-1',
          churchId: 'church-1',
          eventId: 'event-1',
          ministryId: 'ministry-1',
          state: 'rostering',
        },
        event: {
          id: 'event-1',
          churchId: 'church-1',
          planningCycleId: 'cycle-1',
          title: 'Sunday service',
          startDate: '2026-07-05T09:00:00.000Z',
          endDate: '2026-07-05T11:00:00.000Z',
          status: 'scheduled',
          eventType: 'hourly',
          createdAt: '2026-07-01T09:00:00.000Z',
          updatedAt: '2026-07-01T09:00:00.000Z',
        },
        slots: [
          {
            slot: {
              id: 'slot-1',
              churchId: 'church-1',
              eventId: 'event-1',
              startTime: '2026-07-05T09:00:00.000Z',
              endTime: '2026-07-05T11:00:00.000Z',
              status: 'active',
              requirements: [],
            },
            included: true,
            shifts: [
              {
                shift: {
                  id: 'shift-1',
                  participationId: 'participation-1',
                  timeSlotId: 'slot-1',
                  startTime: '2026-07-05T09:00:00.000Z',
                  endTime: '2026-07-05T11:00:00.000Z',
                },
                requirements: [],
                assignments,
                eligibleVolunteers: [],
              },
              {
                shift: {
                  id: 'shift-2',
                  participationId: 'participation-1',
                  timeSlotId: 'slot-1',
                  startTime: '2026-07-05T09:00:00.000Z',
                  endTime: '2026-07-05T11:00:00.000Z',
                },
                requirements: [],
                assignments: [],
                eligibleVolunteers: [],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('addOptimisticAssignment', () => {
  it('appends a pending row to the targeted shift only', () => {
    const data = makeData({ assignments: [EXISTING_ASSIGNMENT] });

    const next = addOptimisticAssignment({
      data,
      assignmentId: 'optimistic:1',
      shiftId: 'shift-1',
      body: { volunteerId: 'bruno', roleId: 'role-1' },
      assignedAt: '2026-07-02T10:00:00.000Z',
    });

    const shifts = next.events[0].slots[0].shifts;
    expect(shifts[0].assignments).toEqual([
      EXISTING_ASSIGNMENT,
      {
        id: 'optimistic:1',
        churchId: 'church-1',
        slotId: 'slot-1',
        participationId: 'participation-1',
        shiftId: 'shift-1',
        volunteerId: 'bruno',
        roleId: 'role-1',
        status: 'pending',
        reason: undefined,
        assignedAt: '2026-07-02T10:00:00.000Z',
      },
    ]);
    expect(shifts[1].assignments).toEqual([]);
  });

  it('carries the override reason so the row matches what the server will store', () => {
    const data = makeData({ assignments: [] });

    const next = addOptimisticAssignment({
      data,
      assignmentId: 'optimistic:1',
      shiftId: 'shift-1',
      body: {
        volunteerId: 'bruno',
        roleId: 'role-1',
        override: { reason: 'Only trained operator available' },
      },
      assignedAt: '2026-07-02T10:00:00.000Z',
    });

    expect(next.events[0].slots[0].shifts[0].assignments[0].reason).toBe(
      'Only trained operator available',
    );
  });

  it('leaves the previous cache untouched so a rollback can restore it', () => {
    const data = makeData({ assignments: [EXISTING_ASSIGNMENT] });

    addOptimisticAssignment({
      data,
      assignmentId: 'optimistic:1',
      shiftId: 'shift-1',
      body: { volunteerId: 'bruno', roleId: 'role-1' },
      assignedAt: '2026-07-02T10:00:00.000Z',
    });

    expect(data.events[0].slots[0].shifts[0].assignments).toEqual([
      EXISTING_ASSIGNMENT,
    ]);
  });

  it('is a no-op when the shift is not in the cache', () => {
    const data = makeData({ assignments: [EXISTING_ASSIGNMENT] });

    const next = addOptimisticAssignment({
      data,
      assignmentId: 'optimistic:1',
      shiftId: 'shift-missing',
      body: { volunteerId: 'bruno', roleId: 'role-1' },
      assignedAt: '2026-07-02T10:00:00.000Z',
    });

    expect(next.events[0].slots[0].shifts[0].assignments).toEqual([
      EXISTING_ASSIGNMENT,
    ]);
  });
});

describe('removeOptimisticAssignment', () => {
  it('drops the assignment from the shift that holds it', () => {
    const data = makeData({ assignments: [EXISTING_ASSIGNMENT] });

    const next = removeOptimisticAssignment({
      data,
      assignmentId: 'assignment-1',
    });

    expect(next.events[0].slots[0].shifts[0].assignments).toEqual([]);
  });

  it('is a no-op for an unknown assignment id', () => {
    const data = makeData({ assignments: [EXISTING_ASSIGNMENT] });

    const next = removeOptimisticAssignment({
      data,
      assignmentId: 'assignment-missing',
    });

    expect(next.events[0].slots[0].shifts[0].assignments).toEqual([
      EXISTING_ASSIGNMENT,
    ]);
  });
});

describe('replaceOptimisticAssignmentVolunteer', () => {
  it('swaps the volunteer in place and records the reason', () => {
    const data = makeData({ assignments: [EXISTING_ASSIGNMENT] });

    const next = replaceOptimisticAssignmentVolunteer({
      data,
      assignmentId: 'assignment-1',
      volunteerId: 'bruno',
      reason: 'Swapped in the cycle builder',
    });

    expect(next.events[0].slots[0].shifts[0].assignments[0]).toEqual({
      ...EXISTING_ASSIGNMENT,
      volunteerId: 'bruno',
      reason: 'Swapped in the cycle builder',
    });
    expect(data.events[0].slots[0].shifts[0].assignments[0].volunteerId).toBe(
      'ana',
    );
  });
});

describe('optimistic assignment ids', () => {
  it('marks generated ids as client-owned', () => {
    const assignmentId = createOptimisticAssignmentId();

    expect(isOptimisticAssignmentId({ assignmentId })).toBe(true);
    expect(isOptimisticAssignmentId({ assignmentId: 'assignment-1' })).toBe(
      false,
    );
  });
});
