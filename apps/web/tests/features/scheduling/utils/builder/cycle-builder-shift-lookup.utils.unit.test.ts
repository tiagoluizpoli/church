import { describe, expect, it } from 'vitest';
import type {
  CycleBuilderAssignment,
  CycleBuilderEventSummary,
  CycleBuilderEventTimeBlockSummary,
  CycleBuilderShiftSummary,
} from '@/features/scheduling/hooks/use-cycle-builder';
import {
  findShiftById,
  focusKey,
  requirementHasRoom,
} from '@/features/scheduling/utils/builder/cycle-builder-shift-lookup.utils';

function makeShift(
  overrides: Partial<CycleBuilderShiftSummary> = {},
): CycleBuilderShiftSummary {
  return {
    shiftId: 'shift-1',
    eventTimeBlockId: 'event-time-block-1',
    label: 'manhã',
    startTime: '2027-01-04T12:00:00.000Z',
    endTime: '2027-01-04T13:00:00.000Z',
    peopleNeeded: 1,
    assignedCount: 0,
    requirements: [],
    assignments: [],
    eligibleVolunteerCount: 0,
    eligibleVolunteers: [],
    ...overrides,
  };
}

function makeEventTimeBlock(
  overrides: Partial<CycleBuilderEventTimeBlockSummary> = {},
): CycleBuilderEventTimeBlockSummary {
  return {
    eventTimeBlockId: 'event-time-block-1',
    label: 'manhã',
    startTime: '2027-01-04T12:00:00.000Z',
    endTime: '2027-01-04T13:00:00.000Z',
    included: true,
    peopleNeeded: 1,
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
    state: 'assigning',
    eventId: 'event-1',
    title: 'teste',
    start: '2027-01-04T03:00:00.000Z',
    end: '2027-01-05T02:59:59.999Z',
    status: 'draft',
    fillRatio: 0,
    peopleNeeded: 1,
    assignedCount: 0,
    eventTimeBlockCount: 1,
    eventTimeBlocks: [makeEventTimeBlock()],
    ...overrides,
  };
}

function makeAssignment(
  overrides: Partial<CycleBuilderAssignment> &
    Pick<CycleBuilderAssignment, 'id' | 'volunteerId'>,
): CycleBuilderAssignment {
  return {
    churchId: 'church-1',
    eventTimeBlockId: 'event-time-block-1',
    shiftId: 'shift-1',
    roleId: 'role-1',
    shiftRequirementId: 'requirement-role-1',
    status: 'confirmed',
    assignedAt: '2027-01-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('focusKey', () => {
  it('uses the requirement as the cell identity', () => {
    expect(focusKey({ shiftRequirementId: 'requirement-1' })).not.toBe(
      focusKey({ shiftRequirementId: 'requirement-2' }),
    );
  });
});

describe('roleHasRoom', () => {
  it('has room while active assignments sit below the required headcount', () => {
    const shift = makeShift({
      requirements: [
        {
          id: 'requirement-role-1',
          roleId: 'role-1',
          sectorName: 'Main',
          peopleNeeded: 2,
        },
      ],
      assignments: [makeAssignment({ id: 'a-1', volunteerId: 'ana' })],
    });

    expect(
      requirementHasRoom({ shift, shiftRequirementId: 'requirement-role-1' }),
    ).toBe(true);
  });

  it('is full once active assignments reach the headcount', () => {
    const shift = makeShift({
      requirements: [
        {
          id: 'requirement-role-1',
          roleId: 'role-1',
          sectorName: 'Main',
          peopleNeeded: 1,
        },
      ],
      assignments: [makeAssignment({ id: 'a-1', volunteerId: 'ana' })],
    });

    expect(
      requirementHasRoom({ shift, shiftRequirementId: 'requirement-role-1' }),
    ).toBe(false);
  });

  it('ignores cancelled and declined assignments against the ceiling', () => {
    const shift = makeShift({
      requirements: [
        {
          id: 'requirement-role-1',
          roleId: 'role-1',
          sectorName: 'Main',
          peopleNeeded: 1,
        },
      ],
      assignments: [
        makeAssignment({ id: 'a-1', volunteerId: 'ana', status: 'cancelled' }),
        makeAssignment({ id: 'a-2', volunteerId: 'bruno', status: 'declined' }),
      ],
    });

    expect(
      requirementHasRoom({ shift, shiftRequirementId: 'requirement-role-1' }),
    ).toBe(true);
  });

  it('has no room for a role with no requirement at all', () => {
    const shift = makeShift({ requirements: [], assignments: [] });

    expect(
      requirementHasRoom({ shift, shiftRequirementId: 'requirement-role-1' }),
    ).toBe(false);
  });
});

describe('findShiftById', () => {
  it('finds a shift nested in any event time block, or returns undefined', () => {
    const data = {
      events: [
        makeEvent({
          eventTimeBlocks: [makeEventTimeBlock({ shifts: [makeShift()] })],
        }),
      ],
      assignments: [],
      roles: [],
    };

    expect(findShiftById({ data, shiftId: 'shift-1' })?.shiftId).toBe(
      'shift-1',
    );
    expect(findShiftById({ data, shiftId: 'nope' })).toBeUndefined();
  });
});
