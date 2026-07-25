import { describe, expect, it } from 'vitest';
import {
  overrideKindForFit,
  volunteerFitForShiftRole,
} from './cycle-builder-fit.utils';
import type {
  CycleBuilderEligibleVolunteerSummary,
  CycleBuilderShiftSummary,
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

function makeEligible(
  overrides: Partial<CycleBuilderEligibleVolunteerSummary> &
    Pick<CycleBuilderEligibleVolunteerSummary, 'volunteerId' | 'volunteerName'>,
): CycleBuilderEligibleVolunteerSummary {
  return {
    isAvailable: true,
    hasConflict: false,
    qualifiedRoleIds: ['role-1'],
    ...overrides,
  };
}

describe('volunteerFitForShiftRole', () => {
  const shift = makeShift({
    eligibleVolunteers: [
      makeEligible({ volunteerId: 'ready', volunteerName: 'Ana' }),
      makeEligible({
        volunteerId: 'silent',
        volunteerName: 'Bruno',
        isAvailable: false,
      }),
      makeEligible({
        volunteerId: 'conflicted',
        volunteerName: 'Carla',
        hasConflict: true,
      }),
      makeEligible({
        volunteerId: 'other-role',
        volunteerName: 'Diego',
        qualifiedRoleIds: ['role-2'],
      }),
    ],
  });

  it('reads a qualified, free volunteer as ready', () => {
    expect(
      volunteerFitForShiftRole({
        shift,
        roleId: 'role-1',
        volunteerId: 'ready',
      }),
    ).toEqual({ tier: 'ready' });
  });

  it('reads a qualified but unavailable or double-booked volunteer as an override', () => {
    expect(
      volunteerFitForShiftRole({
        shift,
        roleId: 'role-1',
        volunteerId: 'silent',
      }),
    ).toEqual({ tier: 'override', conflictType: 'unavailable' });
    expect(
      volunteerFitForShiftRole({
        shift,
        roleId: 'role-1',
        volunteerId: 'conflicted',
      }),
    ).toEqual({ tier: 'override', conflictType: 'double_booked' });
  });

  it('reads another role’s qualification as unqualified, not as a non-candidate', () => {
    // Assignable with a reason: the server warns NOT_QUALIFIED and only
    // refuses under hard enforcement when no override reason came with it.
    expect(
      volunteerFitForShiftRole({
        shift,
        roleId: 'role-1',
        volunteerId: 'other-role',
      }),
    ).toEqual({ tier: 'unqualified', conflictType: undefined });
  });

  it('carries the availability conflict on an unqualified fit so one dialog covers both', () => {
    const doubleTrouble = makeShift({
      eligibleVolunteers: [
        makeEligible({
          volunteerId: 'ana',
          volunteerName: 'Ana',
          qualifiedRoleIds: ['role-2'],
          hasConflict: true,
        }),
      ],
    });

    expect(
      volunteerFitForShiftRole({
        shift: doubleTrouble,
        roleId: 'role-1',
        volunteerId: 'ana',
      }),
    ).toEqual({ tier: 'unqualified', conflictType: 'double_booked' });
  });

  it('offers nothing for someone who is not a candidate for this shift at all', () => {
    // `none` now means exactly one thing — not in this shift's eligible pool,
    // which the server rejects hard as NOT_IN_MINISTRY. No gesture offers it.
    expect(
      volunteerFitForShiftRole({
        shift,
        roleId: 'role-1',
        volunteerId: 'stranger',
      }),
    ).toEqual({ tier: 'none' });
  });

  it('reads an unconfigured ministry as unqualified rather than as an empty board', () => {
    const unconfigured = makeShift({
      eligibleVolunteers: [
        makeEligible({
          volunteerId: 'ana',
          volunteerName: 'Ana',
          qualifiedRoleIds: [],
        }),
      ],
    });

    expect(
      volunteerFitForShiftRole({
        shift: unconfigured,
        roleId: 'role-1',
        volunteerId: 'ana',
      }),
    ).toEqual({ tier: 'unqualified', conflictType: undefined });
  });
});

describe('overrideKindForFit', () => {
  it('asks for no reason when the fit is ready', () => {
    expect(overrideKindForFit({ fit: { tier: 'ready' } })).toBeUndefined();
    expect(overrideKindForFit({ fit: { tier: 'none' } })).toBeUndefined();
  });

  it('forwards the availability conflict of an override fit', () => {
    expect(
      overrideKindForFit({
        fit: { tier: 'override', conflictType: 'double_booked' },
      }),
    ).toBe('double_booked');
  });

  it('reports qualification ahead of availability, so one reason covers both', () => {
    expect(
      overrideKindForFit({
        fit: { tier: 'unqualified', conflictType: 'unavailable' },
      }),
    ).toBe('not_qualified');
  });
});

describe('volunteerFitForShiftRole conflict cause', () => {
  it('names the conflict so an override can reach the reason dialog (FR-016)', () => {
    const shift = makeShift({
      eligibleVolunteers: [
        makeEligible({
          volunteerId: 'double-booked',
          volunteerName: 'Ana',
          hasConflict: true,
        }),
        makeEligible({
          volunteerId: 'unavailable',
          volunteerName: 'Bruno',
          isAvailable: false,
        }),
      ],
    });

    const doubleBooked = volunteerFitForShiftRole({
      shift,
      roleId: 'role-1',
      volunteerId: 'double-booked',
    });
    const unavailable = volunteerFitForShiftRole({
      shift,
      roleId: 'role-1',
      volunteerId: 'unavailable',
    });

    expect(doubleBooked).toEqual({
      tier: 'override',
      conflictType: 'double_booked',
    });
    expect(unavailable).toEqual({
      tier: 'override',
      conflictType: 'unavailable',
    });
  });
});
