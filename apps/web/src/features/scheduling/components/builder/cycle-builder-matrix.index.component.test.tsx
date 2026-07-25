import { describe, expect, it } from 'vitest';
import {
  assignedVolunteerIdsForShift,
  buildShiftAssignmentIndex,
} from './cycle-builder-matrix.utils';
import type {
  CycleBuilderAssignment,
  CycleBuilderData,
  CycleBuilderEventSummary,
  CycleBuilderShiftSummary,
  CycleBuilderSlotSummary,
} from '@/features/scheduling/hooks/use-cycle-builder';

/**
 * These two helpers were extracted from `candidates()`/`recommendations()` for
 * B-6: the board rebuilt the workload map and the shift-context map once per
 * role per shift per column. The index now runs once per query payload, so the
 * behaviour those cells depend on has to be pinned here — nothing rendered the
 * old private functions, so this is their first coverage.
 */

function makeAssignment(
  overrides: Partial<CycleBuilderAssignment> &
    Pick<CycleBuilderAssignment, 'id' | 'volunteerId'>,
): CycleBuilderAssignment {
  return {
    churchId: 'church-1',
    slotId: 'slot-1',
    shiftId: 'shift-1',
    roleId: 'role-1',
    status: 'confirmed',
    assignedAt: '2027-01-01T12:00:00.000Z',
    ...overrides,
  };
}

function makeShift(
  overrides: Partial<CycleBuilderShiftSummary> = {},
): CycleBuilderShiftSummary {
  return {
    shiftId: 'shift-1',
    slotId: 'slot-1',
    label: 'manhã',
    startTime: '2027-01-04T12:00:00.000Z',
    endTime: '2027-01-04T13:00:00.000Z',
    requiredCount: 1,
    assignedCount: 0,
    requirements: [],
    assignments: [],
    eligibleVolunteerCount: 0,
    eligibleVolunteers: [],
    ...overrides,
  };
}

function makeSlot(
  overrides: Partial<CycleBuilderSlotSummary> = {},
): CycleBuilderSlotSummary {
  return {
    slotId: 'slot-1',
    label: 'manhã',
    startTime: '2027-01-04T12:00:00.000Z',
    endTime: '2027-01-04T13:00:00.000Z',
    included: true,
    requiredCount: 1,
    assignedCount: 0,
    shiftCount: 1,
    shifts: [makeShift()],
    ...overrides,
  };
}

function makeEvent(
  overrides: Partial<CycleBuilderEventSummary> = {},
): CycleBuilderEventSummary {
  return {
    participationId: 'participation-1',
    state: 'rostering',
    eventId: 'event-1',
    title: 'Sunday service',
    startDate: '2027-01-04T03:00:00.000Z',
    endDate: '2027-01-05T02:59:59.999Z',
    status: 'draft',
    eventType: 'hourly',
    fillRatio: 0,
    requiredCount: 1,
    assignedCount: 0,
    slotCount: 1,
    slots: [makeSlot()],
    ...overrides,
  };
}

function makeData(overrides: Partial<CycleBuilderData> = {}): CycleBuilderData {
  return {
    events: [
      makeEvent({
        slots: [
          makeSlot({
            shifts: [
              makeShift({ shiftId: 'shift-1', label: 'Morning' }),
              makeShift({ shiftId: 'shift-2', label: 'Evening' }),
            ],
          }),
        ],
      }),
    ],
    assignments: [],
    roles: [
      { id: 'role-1', name: 'Sound' },
      { id: 'role-2', name: 'Vocals' },
    ],
    ...overrides,
  };
}

describe('buildShiftAssignmentIndex', () => {
  it('counts cycle workload only for active assignments', () => {
    const data = makeData({
      assignments: [
        makeAssignment({ id: 'a-1', volunteerId: 'ana', shiftId: 'shift-1' }),
        makeAssignment({ id: 'a-2', volunteerId: 'ana', shiftId: 'shift-2' }),
        makeAssignment({
          id: 'a-3',
          volunteerId: 'ana',
          shiftId: 'shift-2',
          status: 'cancelled',
        }),
        makeAssignment({ id: 'a-4', volunteerId: 'bruno', status: 'declined' }),
      ],
    });

    const { workload } = buildShiftAssignmentIndex({ data });

    expect(workload.get('ana')).toBe(2);
    expect(workload.has('bruno')).toBe(false);
  });

  it('groups active shift-bound assignments by volunteer with role + shift labels', () => {
    const data = makeData({
      assignments: [
        makeAssignment({
          id: 'a-1',
          volunteerId: 'ana',
          shiftId: 'shift-1',
          roleId: 'role-1',
        }),
        makeAssignment({
          id: 'a-2',
          volunteerId: 'ana',
          shiftId: 'shift-2',
          roleId: 'role-2',
        }),
      ],
    });

    const { activeAssignmentsByVolunteerId } = buildShiftAssignmentIndex({
      data,
    });

    const anaContexts = activeAssignmentsByVolunteerId.get('ana');
    expect(anaContexts).toHaveLength(2);
    expect(anaContexts?.[0].detail).toContain('Sunday service');
    expect(anaContexts?.[0].detail).toContain('Morning');
    expect(anaContexts?.[0].detail).toContain('Sound');
    expect(anaContexts?.[1].summary).toContain('Vocals');
  });

  it('still counts workload for an assignment whose shift is unknown, but files no context', () => {
    const data = makeData({
      assignments: [
        makeAssignment({ id: 'a-1', volunteerId: 'ana', shiftId: 'ghost' }),
      ],
    });

    const index = buildShiftAssignmentIndex({ data });

    expect(index.workload.get('ana')).toBe(1);
    expect(index.activeAssignmentsByVolunteerId.has('ana')).toBe(false);
  });
});

describe('assignedVolunteerIdsForShift', () => {
  it('returns active assignees of the shift and drops inactive ones', () => {
    const shift = makeShift({
      assignments: [
        makeAssignment({ id: 'a-1', volunteerId: 'ana' }),
        makeAssignment({ id: 'a-2', volunteerId: 'bruno', status: 'draft' }),
        makeAssignment({
          id: 'a-3',
          volunteerId: 'carla',
          status: 'cancelled',
        }),
      ],
    });

    const ids = assignedVolunteerIdsForShift({ shift });

    expect([...ids].sort()).toEqual(['ana', 'bruno']);
  });
});
