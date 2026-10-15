import { describe, expect, it } from 'vitest';
import type {
  CycleBuilderEligibleVolunteerSummary,
  CycleBuilderShiftSummary,
} from '@/features/scheduling/hooks/use-cycle-builder';
import {
  isAssignableFit,
  overrideKindForFit,
  volunteerFitForShiftRole,
} from '@/features/scheduling/utils/builder/cycle-builder-fit.utils';

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

function makeEligible(
  overrides: Partial<CycleBuilderEligibleVolunteerSummary> &
    Pick<CycleBuilderEligibleVolunteerSummary, 'volunteerId' | 'volunteerName'>,
): CycleBuilderEligibleVolunteerSummary {
  return {
    isAvailable: true,
    hasConflict: false,
    qualifiedRoleIds: ['role-1'],
    ministryAccessLevel: 'volunteer',
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

  it('reads a qualified but unavailable volunteer as an override', () => {
    expect(
      volunteerFitForShiftRole({
        shift,
        roleId: 'role-1',
        volunteerId: 'silent',
      }),
    ).toEqual({ tier: 'override' });
  });

  it('blocks a double-booked volunteer: not assignable, no override (DOUBLE_BOOKED is always refused)', () => {
    const fit = volunteerFitForShiftRole({
      shift,
      roleId: 'role-1',
      volunteerId: 'conflicted',
    });

    expect(fit).toEqual({ tier: 'none' });
    expect(isAssignableFit({ fit })).toBe(false);
    expect(overrideKindForFit({ fit })).toBeUndefined();
  });

  it('reads another role’s qualification as unqualified, not as a non-candidate', () => {
    // Assignable after an override: the server only warns NOT_QUALIFIED.
    expect(
      volunteerFitForShiftRole({
        shift,
        roleId: 'role-1',
        volunteerId: 'other-role',
      }),
    ).toEqual({ tier: 'unqualified' });
  });

  it('blocks a double-booked volunteer even when unqualified', () => {
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
    ).toEqual({ tier: 'none' });
  });

  it('offers nothing for someone who is not a candidate for this shift at all', () => {
    // Not in this shift's eligible pool: the server rejects it hard as
    // NOT_IN_MINISTRY. No gesture offers it.
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
    ).toEqual({ tier: 'unqualified' });
  });
});

describe('overrideKindForFit', () => {
  it('asks for no reason when the fit is ready', () => {
    expect(overrideKindForFit({ fit: { tier: 'ready' } })).toBeUndefined();
    expect(overrideKindForFit({ fit: { tier: 'none' } })).toBeUndefined();
  });

  it('asks an override fit to justify unavailability', () => {
    expect(overrideKindForFit({ fit: { tier: 'override' } })).toBe(
      'unavailable',
    );
  });

  it('asks an unqualified fit to justify qualification', () => {
    expect(
      overrideKindForFit({
        fit: { tier: 'unqualified' },
      }),
    ).toBe('not_qualified');
  });
});
