import { compareInstants, type Instant } from '@church/time';
import type { RoleId, ShiftId } from '../branded-ids';

/**
 * Assignment eligibility (#1122): may this Volunteer fill this
 * ShiftRequirement now? Pure — the caller loads the facts once, under its
 * locks, and maps a refusal to its own error. Every rule lives here, in the
 * order refusals take precedence; manual assign, reassign, move and proposal
 * Apply only choose which list applies.
 */

/** Which cancellation closed a Shift; an Event's outranks its block's. */
export type ShiftCancellation = 'event' | 'event_time_block';

export interface EligibilityShift {
  shiftId: ShiftId;
  startTime: Instant;
  endTime: Instant;
  cancelledBy: ShiftCancellation | null;
}

export interface EligibilityNeed {
  roleId: RoleId;
  peopleNeeded: number;
  /** Active Assignments already filling it, less any one being replaced or moved. */
  filled: number;
}

export interface EligibilityBooking {
  shiftId: ShiftId;
  startTime: Instant;
  endTime: Instant;
}

export interface EligibilityVolunteer {
  /** Holds an active Membership in the Shift's Ministry. */
  isMember: boolean;
  /** Role qualifications held in that Ministry. */
  roleIds: readonly RoleId[];
  /** Their answer this Cycle; absent when not loaded, never inferred. */
  availability?: 'confirmed' | 'not_confirmed';
  unavailableShiftIds: readonly ShiftId[];
  /** Active Assignments in any Ministry, less any one being moved. */
  bookings: readonly EligibilityBooking[];
}

export interface AssignmentEligibilityFacts {
  now: Instant;
  shift: EligibilityShift;
  /** Null when the ShiftRequirement is not one of this Shift's (for a move: not one of its Role). */
  need: EligibilityNeed | null;
  volunteer: EligibilityVolunteer;
}

export const ASSIGNMENT_REFUSAL_OPTIONS = [
  'SHIFT_STARTED',
  'EVENT_CANCELLED',
  'EVENT_TIME_BLOCK_CANCELLED',
  'REQUIREMENT_NOT_ON_SHIFT',
  'NOT_IN_MINISTRY',
  'AVAILABILITY_NOT_CONFIRMED',
  'NOT_QUALIFIED',
  'ALREADY_ON_SHIFT',
  'SHIFT_REQUIREMENT_FULL',
  'UNAVAILABLE',
  'DOUBLE_BOOKED',
] as const;
/** Why a Volunteer may not fill a need, in the order refusals take precedence. */
export type AssignmentRefusal = (typeof ASSIGNMENT_REFUSAL_OPTIONS)[number];

type Rule = (facts: AssignmentEligibilityFacts) => boolean;

export interface ShiftOpenInput {
  shift: EligibilityShift;
  now: Instant;
}

export interface ShiftStartInput {
  startTime: Instant;
  now: Instant;
}

/** From its start on, a Shift's Assignments are fixed. */
export function hasShiftStarted({ startTime, now }: ShiftStartInput): boolean {
  return compareInstants({ left: startTime, right: now }) <= 0;
}

/** Started, cancelled and past Shifts take no new Assignments. */
export function isShiftOpen({ shift, now }: ShiftOpenInput): boolean {
  return (
    shift.cancelledBy === null &&
    !hasShiftStarted({ startTime: shift.startTime, now })
  );
}

interface OverlapInput {
  shift: EligibilityShift;
  booking: EligibilityBooking;
}

function overlaps({ shift, booking }: OverlapInput): boolean {
  return (
    compareInstants({ left: shift.startTime, right: booking.endTime }) < 0 &&
    compareInstants({ left: shift.endTime, right: booking.startTime }) > 0
  );
}

/** Each rule is true when it refuses. */
const RULES: Record<AssignmentRefusal, Rule> = {
  SHIFT_STARTED: ({ shift, now }) =>
    hasShiftStarted({ startTime: shift.startTime, now }),
  EVENT_CANCELLED: ({ shift }) => shift.cancelledBy === 'event',
  EVENT_TIME_BLOCK_CANCELLED: ({ shift }) =>
    shift.cancelledBy === 'event_time_block',
  REQUIREMENT_NOT_ON_SHIFT: ({ need }) => need === null,
  NOT_IN_MINISTRY: ({ volunteer }) => !volunteer.isMember,
  AVAILABILITY_NOT_CONFIRMED: ({ volunteer }) =>
    volunteer.availability !== 'confirmed',
  NOT_QUALIFIED: ({ need, volunteer }) =>
    need !== null && !volunteer.roleIds.includes(need.roleId),
  ALREADY_ON_SHIFT: ({ shift, volunteer }) =>
    volunteer.bookings.some(({ shiftId }) => shiftId === shift.shiftId),
  SHIFT_REQUIREMENT_FULL: ({ need }) =>
    need !== null && need.filled >= need.peopleNeeded,
  UNAVAILABLE: ({ shift, volunteer }) =>
    volunteer.unavailableShiftIds.includes(shift.shiftId),
  // No double-booking in any Ministry; back-to-back Shifts do not overlap.
  DOUBLE_BOOKED: ({ shift, volunteer }) =>
    volunteer.bookings.some(
      (booking) =>
        booking.shiftId !== shift.shiftId && overlaps({ shift, booking }),
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
} as const satisfies Record<string, readonly AssignmentRefusal[]>;

export type EligibilityCheck = keyof typeof ELIGIBILITY_CHECKS;

export interface FindAssignmentRefusalInput {
  check: EligibilityCheck;
  facts: AssignmentEligibilityFacts;
}

/** The refusal that takes precedence, or null when the Volunteer may fill the need. */
export function findAssignmentRefusal({
  check,
  facts,
}: FindAssignmentRefusalInput): AssignmentRefusal | null {
  return (
    ELIGIBILITY_CHECKS[check].find((refusal) => RULES[refusal](facts)) ?? null
  );
}

/** A manual assign goes ahead over an unavailable mark, with this warning. */
export function isMarkedUnavailable(
  facts: AssignmentEligibilityFacts,
): boolean {
  return RULES.UNAVAILABLE(facts);
}
