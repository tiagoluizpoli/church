import type { Instant } from '@church/time';
import type { RoleId, ShiftId } from '../branded-ids';
import type { Shift } from '../entities/shift';
import type { ShiftRequirement } from '../entities/shift-requirement';

/** Which cancellation closed a Shift; an Event's outranks its block's. */
export type ShiftCancellation = 'event' | 'event_time_block';

/** The facts the rule reads that no entity holds. */
export interface AssignmentEligibilityFacts {
  /** Which cancellation closed the Shift, if any. */
  cancelledBy: ShiftCancellation | null;
  /** The Volunteer holds an active Membership in the Shift's Ministry. */
  isMember: boolean;
  /** Role qualifications they hold in that Ministry. */
  roleIds: readonly RoleId[];
  /** Their answer this Cycle; absent when not loaded, never inferred. */
  availability?: 'confirmed' | 'not_confirmed';
  unavailableShiftIds: readonly ShiftId[];
  /** Active Assignments already filling the requirement, less any one being replaced or moved. */
  filled: number;
}

/** May this Volunteer fill this ShiftRequirement now? */
export interface AssignmentEligibility {
  now: Instant;
  /** The Shift being filled. */
  shift: Shift;
  /** Null when it is not one of the Shift's requirements (for a move: not one of its Role). */
  requirement: ShiftRequirement | null;
  /** The Shifts of the Volunteer's active Assignments in any Ministry, less any one being moved. */
  bookings: readonly Shift[];
  facts: AssignmentEligibilityFacts;
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

export type EligibilityRule = (eligibility: AssignmentEligibility) => boolean;

/** The entry points' rule lists: see `ELIGIBILITY_CHECKS`. */
export type EligibilityCheck = 'manual' | 'move' | 'proposal';

export interface FindAssignmentRefusalInput {
  check: EligibilityCheck;
  eligibility: AssignmentEligibility;
}

export interface ShiftOpenInput {
  shift: Shift;
  cancelledBy: ShiftCancellation | null;
  now: Instant;
}
