import { describe, expect, it } from 'vitest';
import {
  findShiftById,
  focusKey,
  roleHasRoom,
} from './cycle-builder-shift-lookup.utils';
import type {
  CycleBuilderAssignment,
  CycleBuilderEventSummary,
  CycleBuilderShiftSummary,
  CycleBuilderSlotSummary,
} from '@/features/scheduling/hooks/use-cycle-builder';

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
    title: 'teste',
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

describe('focusKey', () => {
  it('separates two roles inside the same shift', () => {
    expect(focusKey({ shiftId: 'shift-1', roleId: 'role-1' })).not.toBe(
      focusKey({ shiftId: 'shift-1', roleId: 'role-2' }),
    );
  });
});

describe('roleHasRoom', () => {
  it('has room while active assignments sit below the required headcount', () => {
    const shift = makeShift({
      requirements: [{ roleId: 'role-1', requiredCount: 2 }],
      assignments: [makeAssignment({ id: 'a-1', volunteerId: 'ana' })],
    });

    expect(roleHasRoom({ shift, roleId: 'role-1' })).toBe(true);
  });

  it('is full once active assignments reach the headcount', () => {
    const shift = makeShift({
      requirements: [{ roleId: 'role-1', requiredCount: 1 }],
      assignments: [makeAssignment({ id: 'a-1', volunteerId: 'ana' })],
    });

    expect(roleHasRoom({ shift, roleId: 'role-1' })).toBe(false);
  });

  it('ignores cancelled and declined assignments against the ceiling', () => {
    const shift = makeShift({
      requirements: [{ roleId: 'role-1', requiredCount: 1 }],
      assignments: [
        makeAssignment({ id: 'a-1', volunteerId: 'ana', status: 'cancelled' }),
        makeAssignment({ id: 'a-2', volunteerId: 'bruno', status: 'declined' }),
      ],
    });

    expect(roleHasRoom({ shift, roleId: 'role-1' })).toBe(true);
  });

  it('has no room for a role with no requirement at all', () => {
    const shift = makeShift({ requirements: [], assignments: [] });

    expect(roleHasRoom({ shift, roleId: 'role-1' })).toBe(false);
  });
});

describe('findShiftById', () => {
  it('finds a shift nested in any event slot, or returns undefined', () => {
    const data = {
      events: [makeEvent({ slots: [makeSlot({ shifts: [makeShift()] })] })],
      assignments: [],
      roles: [],
    };

    expect(findShiftById({ data, shiftId: 'shift-1' })?.shiftId).toBe(
      'shift-1',
    );
    expect(findShiftById({ data, shiftId: 'nope' })).toBeUndefined();
  });
});
