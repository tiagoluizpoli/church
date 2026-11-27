import type { Instant } from '@church/time';
import type {
  AssignmentId,
  RoleId,
  ShiftId,
  ShiftRequirementId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { Shift } from '../../entities/shift';
import type { ShiftRequirement } from '../../entities/shift-requirement';
import type {
  EMPTY_PROPOSAL_REASON_OPTIONS,
  VOLUNTEER_DECIDING_RULE_OPTIONS,
} from './assignment-proposal';

/** An active Ministry member who was asked for availability this Cycle. */
export interface ProposalVolunteer {
  volunteerId: VolunteerId;
  /** Role qualifications held in the target Ministry. */
  roleIds: RoleId[];
  availability: 'confirmed' | 'not_confirmed';
  unavailableShiftIds: ShiftId[];
}

/**
 * An active Assignment of the target Schedule or of a candidate, in any
 * Ministry, with its Shift. One that fills a target need counts against it.
 */
export interface ProposalAssignment {
  assignment: Assignment;
  shift: Shift;
  /** It belongs to the target Cycle (counts as workload). */
  inCycle: boolean;
}

export interface ProposeAssignmentsInput {
  now: Instant;
  /** The target Schedule's Shifts. */
  shifts: Shift[];
  /** Those whose EventTimeBlock is cancelled; a cancelled Event's are left out. */
  cancelledShiftIds: ShiftId[];
  /** The target Schedule's ShiftRequirements. */
  needs: ShiftRequirement[];
  volunteers: ProposalVolunteer[];
  assignments: ProposalAssignment[];
}

/** Which Volunteer ranking rule set this Volunteer apart from the next one. */
export type VolunteerDecidingRule =
  (typeof VOLUNTEER_DECIDING_RULE_OPTIONS)[number];

export interface ProposedAdditionReason {
  /** Distinct target-Schedule Shifts the Volunteer could still fill. */
  eligibleShiftCount: number;
  /** Distinct Volunteers who could still fill the chosen need. */
  needCandidateCount: number;
  decidedBy: VolunteerDecidingRule;
}

export interface ProposedAddition {
  volunteerId: VolunteerId;
  shiftRequirementId: ShiftRequirementId;
  shiftId: ShiftId;
  reason: ProposedAdditionReason;
}

export interface ProposalGap {
  shiftRequirementId: ShiftRequirementId;
  shiftId: ShiftId;
  /** People still needed after the proposed additions. */
  remaining: number;
}

export type EmptyProposalReason =
  (typeof EMPTY_PROPOSAL_REASON_OPTIONS)[number];

export interface AssignmentProposal {
  additions: ProposedAddition[];
  gaps: ProposalGap[];
  /** Asked Volunteers whose availability is not confirmed yet. */
  excludedUnconfirmedCount: number;
  emptyReason: EmptyProposalReason | null;
}

export interface OpenNeed {
  requirement: ShiftRequirement;
  shift: Shift;
  remaining: number;
}

export interface Booking {
  shift: Shift;
  inCycle: boolean;
}

export interface Candidate {
  volunteer: ProposalVolunteer;
  bookings: Booking[];
}

export interface Placement {
  candidate: Candidate;
  need: OpenNeed;
}

/** What ranking may look at for one Volunteer. */
export interface VolunteerStanding {
  volunteerId: VolunteerId;
  eligibleShiftCount: number;
  cycleAssignmentCount: number;
}

/** What ranking may look at for one need. */
export interface NeedStanding {
  need: OpenNeed;
  candidateCount: number;
}

export interface CompareInput<T> {
  left: T;
  right: T;
}

export interface RankingRule<T, Name extends string = string> {
  name: Name;
  compare: (input: CompareInput<T>) => number;
}

export interface EligibilityInput {
  candidate: Candidate;
  need: OpenNeed;
  now: Instant;
}

export interface RankInput<T> {
  items: T[];
  rules: RankingRule<T>[];
}

export interface DecidingRuleInput {
  ranked: VolunteerStanding[];
}

export interface BookingsInput {
  assignments: ProposalAssignment[];
}

export interface OpenNeedsInput {
  input: ProposeAssignmentsInput;
}

export interface PlacementsInput {
  candidates: Candidate[];
  needs: OpenNeed[];
  now: Instant;
}

export interface ChooseInput {
  placements: Placement[];
}

export interface Choice {
  placement: Placement;
  reason: ProposedAdditionReason;
}

export interface EmptyReasonInput {
  needs: OpenNeed[];
  candidates: Candidate[];
}

/** A reviewed pair, as Apply submits it back. */
export interface ReviewedAddition {
  volunteerId: VolunteerId;
  shiftRequirementId: ShiftRequirementId;
}

/** A reviewed pair after Apply created its Assignment. */
export interface AppliedProposalAddition extends ReviewedAddition {
  assignmentId: AssignmentId;
}

export interface FindStaleAdditionsInput {
  facts: ProposeAssignmentsInput;
  additions: ReviewedAddition[];
}

export interface ProposalReviewTokenInput {
  cycleId: string;
  ministryId: string;
  additions: ReviewedAddition[];
}
