import {
  ASSIGNMENT_REFUSAL_OPTIONS,
  type AssignmentEligibility,
  type AssignmentRefusal,
  type EligibilityCheck,
  type EligibilityRule,
  type FindAssignmentRefusalInput,
  type ShiftOpenInput,
} from './assignment-eligibility.types';

/**
 * Assignment eligibility (#1122): may this Volunteer fill this
 * ShiftRequirement now? Pure — the caller loads the entities and facts once,
 * under its locks, and maps a refusal to its own error. Every rule lives here,
 * in the order refusals take precedence; manual assign, reassign, move and
 * proposal Apply only choose which list applies.
 */

/** Each rule is true when it refuses. */
const RULES: Record<AssignmentRefusal, EligibilityRule> = {
  SHIFT_STARTED: ({ shift, now }) => shift.hasStarted({ now }),
  EVENT_CANCELLED: ({ facts }) => facts.cancelledBy === 'event',
  EVENT_TIME_BLOCK_CANCELLED: ({ facts }) =>
    facts.cancelledBy === 'event_time_block',
  REQUIREMENT_NOT_ON_SHIFT: ({ requirement }) => requirement === null,
  NOT_IN_MINISTRY: ({ facts }) => !facts.isMember,
  AVAILABILITY_NOT_CONFIRMED: ({ facts }) => facts.availability !== 'confirmed',
  NOT_QUALIFIED: ({ requirement, facts }) =>
    requirement !== null && !facts.roleIds.includes(requirement.roleId),
  ALREADY_ON_SHIFT: ({ shift, bookings }) =>
    bookings.some((booked) => booked.id === shift.id),
  SHIFT_REQUIREMENT_FULL: ({ requirement, facts }) =>
    requirement !== null && facts.filled >= requirement.peopleNeeded,
  UNAVAILABLE: ({ shift, facts }) =>
    facts.unavailableShiftIds.includes(shift.id),
  // No double-booking in any Ministry; back-to-back Shifts do not overlap.
  DOUBLE_BOOKED: ({ shift, bookings }) =>
    bookings.some(
      (booked) => booked.id !== shift.id && shift.overlaps({ other: booked }),
    ),
};

/**
 * Which rules each entry point applies (ADR 0012/0013):
 * - `manual`: assign and reassign. An unavailable mark only warns.
 * - `move`: the same Volunteer to another need of its Shift and Role.
 * - `proposal`: a proposed or applied pair also needs a confirmed answer and
 *   no unavailable mark.
 */
export const ELIGIBILITY_CHECKS = {
  manual: [
    'SHIFT_STARTED',
    'EVENT_CANCELLED',
    'EVENT_TIME_BLOCK_CANCELLED',
    'REQUIREMENT_NOT_ON_SHIFT',
    'NOT_IN_MINISTRY',
    'NOT_QUALIFIED',
    'ALREADY_ON_SHIFT',
    'SHIFT_REQUIREMENT_FULL',
    'DOUBLE_BOOKED',
  ],
  move: [
    'SHIFT_STARTED',
    'REQUIREMENT_NOT_ON_SHIFT',
    'ALREADY_ON_SHIFT',
    'SHIFT_REQUIREMENT_FULL',
  ],
  proposal: ASSIGNMENT_REFUSAL_OPTIONS,
} as const satisfies Record<EligibilityCheck, readonly AssignmentRefusal[]>;

/** The refusal that takes precedence, or null when the Volunteer may fill the need. */
export function findAssignmentRefusal({
  check,
  eligibility,
}: FindAssignmentRefusalInput): AssignmentRefusal | null {
  return (
    ELIGIBILITY_CHECKS[check].find((refusal) => RULES[refusal](eligibility)) ??
    null
  );
}

/** A manual assign goes ahead over an unavailable mark, with this warning. */
export function isMarkedUnavailable(
  eligibility: AssignmentEligibility,
): boolean {
  return RULES.UNAVAILABLE(eligibility);
}

/** Started, cancelled and past Shifts take no new Assignments. */
export function isShiftOpen({
  shift,
  cancelledBy,
  now,
}: ShiftOpenInput): boolean {
  return cancelledBy === null && !shift.hasStarted({ now });
}
