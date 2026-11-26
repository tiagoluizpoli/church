import { parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import type { RoleId, ShiftId } from '@/domain/branded-ids';
import {
  ELIGIBILITY_CHECKS,
  findAssignmentRefusal,
  isMarkedUnavailable,
  isShiftOpen,
} from '@/domain/services/assignment-eligibility';
import {
  ASSIGNMENT_REFUSAL_OPTIONS,
  type AssignmentEligibility,
  type AssignmentRefusal,
} from '@/domain/services/assignment-eligibility.types';
import {
  testRequirement,
  testShift,
} from '@/tests/test-support/scheduling-entities';

const at = (time: string) =>
  parseInstant({ value: `2026-10-04T${time}:00.000Z` });

const SHIFT = 'shift' as ShiftId;
const OTHER = 'other-shift' as ShiftId;
const GREETER = 'greeter' as RoleId;

const TARGET = testShift({
  id: SHIFT,
  startTime: at('09:00'),
  endTime: at('10:00'),
});

/** A confirmed, qualified member, free, before a 09:00–10:00 Shift with room. */
function eligible(): AssignmentEligibility {
  return {
    now: at('08:00'),
    shift: TARGET,
    requirement: testRequirement({
      id: 'requirement',
      shiftId: SHIFT,
      roleId: GREETER,
      peopleNeeded: 2,
    }),
    bookings: [],
    facts: {
      cancelledBy: null,
      isMember: true,
      roleIds: [GREETER],
      availability: 'confirmed',
      unavailableShiftIds: [],
      filled: 1,
    },
  };
}

type Breaker = (eligibility: AssignmentEligibility) => void;

/** One change per refusal that makes it, and only it, true. */
const BREAKERS: Record<AssignmentRefusal, Breaker> = {
  SHIFT_STARTED: (eligibility) => {
    eligibility.now = at('09:00');
  },
  EVENT_CANCELLED: ({ facts }) => {
    facts.cancelledBy = 'event';
  },
  EVENT_TIME_BLOCK_CANCELLED: ({ facts }) => {
    facts.cancelledBy = 'event_time_block';
  },
  REQUIREMENT_NOT_ON_SHIFT: (eligibility) => {
    eligibility.requirement = null;
  },
  NOT_IN_MINISTRY: ({ facts }) => {
    facts.isMember = false;
  },
  AVAILABILITY_NOT_CONFIRMED: ({ facts }) => {
    facts.availability = 'not_confirmed';
  },
  NOT_QUALIFIED: ({ facts }) => {
    facts.roleIds = [];
  },
  ALREADY_ON_SHIFT: (eligibility) => {
    eligibility.bookings = [TARGET];
  },
  SHIFT_REQUIREMENT_FULL: ({ facts }) => {
    facts.filled = 2;
  },
  UNAVAILABLE: ({ facts }) => {
    facts.unavailableShiftIds = [SHIFT];
  },
  DOUBLE_BOOKED: (eligibility) => {
    eligibility.bookings = [
      testShift({ id: OTHER, startTime: at('09:30'), endTime: at('10:30') }),
    ];
  },
};

function factsBreaking(
  ...refusals: AssignmentRefusal[]
): AssignmentEligibility {
  const eligibility = eligible();
  for (const refusal of refusals) BREAKERS[refusal](eligibility);
  return eligibility;
}

describe('findAssignmentRefusal', () => {
  it('admits an eligible Volunteer under every check', () => {
    for (const check of ['manual', 'move', 'proposal'] as const)
      expect(
        findAssignmentRefusal({ check, eligibility: eligible() }),
      ).toBeNull();
  });

  for (const refusal of ASSIGNMENT_REFUSAL_OPTIONS) {
    it(`answers ${refusal} under the checks that apply it`, () => {
      for (const [check, refusals] of Object.entries(ELIGIBILITY_CHECKS)) {
        const applies = (refusals as readonly AssignmentRefusal[]).includes(
          refusal,
        );
        expect(
          findAssignmentRefusal({
            check: check as keyof typeof ELIGIBILITY_CHECKS,
            eligibility: factsBreaking(refusal),
          }),
        ).toBe(applies ? refusal : null);
      }
    });
  }

  it('answers the earlier refusal when two hold, in the documented order', () => {
    const { proposal } = ELIGIBILITY_CHECKS;
    for (const [index, earlier] of proposal.entries())
      for (const later of proposal.slice(index + 1)) {
        // Both cancellations cannot hold at once, and a duplicate booking replaces an overlap.
        if (
          earlier === 'EVENT_CANCELLED' &&
          later === 'EVENT_TIME_BLOCK_CANCELLED'
        )
          continue;
        if (earlier === 'ALREADY_ON_SHIFT' && later === 'DOUBLE_BOOKED')
          continue;
        // Without a need there is no Role or headcount to refuse.
        if (earlier === 'REQUIREMENT_NOT_ON_SHIFT') continue;
        expect(
          findAssignmentRefusal({
            check: 'proposal',
            eligibility: factsBreaking(later, earlier),
          }),
          `${earlier} before ${later}`,
        ).toBe(earlier);
      }
  });

  it('keeps manual assign precedence exactly as the API answers it', () => {
    expect(ELIGIBILITY_CHECKS.manual).toEqual([
      'SHIFT_STARTED',
      'EVENT_CANCELLED',
      'EVENT_TIME_BLOCK_CANCELLED',
      'REQUIREMENT_NOT_ON_SHIFT',
      'NOT_IN_MINISTRY',
      'NOT_QUALIFIED',
      'ALREADY_ON_SHIFT',
      'SHIFT_REQUIREMENT_FULL',
      'DOUBLE_BOOKED',
    ]);
    expect(ELIGIBILITY_CHECKS.move).toEqual([
      'SHIFT_STARTED',
      'REQUIREMENT_NOT_ON_SHIFT',
      'ALREADY_ON_SHIFT',
      'SHIFT_REQUIREMENT_FULL',
    ]);
  });

  it('admits a back-to-back booking in another Ministry', () => {
    const eligibility = eligible();
    eligibility.bookings = [
      testShift({ id: OTHER, startTime: at('10:00'), endTime: at('11:00') }),
      testShift({ id: OTHER, startTime: at('08:00'), endTime: at('09:00') }),
    ];
    expect(findAssignmentRefusal({ check: 'manual', eligibility })).toBeNull();
  });

  it('never infers availability from a missing answer', () => {
    const eligibility = eligible();
    delete eligibility.facts.availability;
    expect(findAssignmentRefusal({ check: 'proposal', eligibility })).toBe(
      'AVAILABILITY_NOT_CONFIRMED',
    );
    expect(findAssignmentRefusal({ check: 'manual', eligibility })).toBeNull();
  });
});

describe('shift and warning helpers', () => {
  it('flags an unavailable mark as the manual warning', () => {
    expect(isMarkedUnavailable(factsBreaking('UNAVAILABLE'))).toBe(true);
    expect(isMarkedUnavailable(eligible())).toBe(false);
  });

  it('closes a Shift at its start and when cancelled', () => {
    const { shift } = eligible();
    expect(isShiftOpen({ shift, cancelledBy: null, now: at('08:59') })).toBe(
      true,
    );
    expect(isShiftOpen({ shift, cancelledBy: null, now: at('09:00') })).toBe(
      false,
    );
    expect(
      isShiftOpen({
        shift,
        cancelledBy: 'event_time_block',
        now: at('08:00'),
      }),
    ).toBe(false);
    expect(shift.hasStarted({ now: at('09:00') })).toBe(true);
  });
});
