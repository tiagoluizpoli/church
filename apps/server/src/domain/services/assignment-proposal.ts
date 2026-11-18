import { createHash } from 'node:crypto';
import { compareInstants, type Instant } from '@church/time';
import type {
  AssignmentId,
  RoleId,
  ShiftId,
  ShiftRequirementId,
  VolunteerId,
} from '../branded-ids';

/**
 * Assignment proposal for one Schedule (#855): deterministic greedy selection
 * over scheduling facts. Pure — it never reads or writes the database; the
 * application loads the facts, authorizes, and (later) persists approved
 * additions after its own transactional validation.
 *
 * Apply (ADR 0013) re-runs the same eligibility rules over freshly loaded
 * facts through `findStaleAdditions`, and binds approval to the reviewed pairs
 * through `proposalReviewTokenFor`.
 *
 * Organization: eligibility rules decide whether a Volunteer may fill a need
 * at all; the two ranking lists below decide who goes first and where. Change
 * policy by editing those lists, not the loop.
 */

export interface ProposalShift {
  shiftId: ShiftId;
  startTime: Instant;
  endTime: Instant;
  /** Its Event or EventTimeBlock is cancelled. */
  cancelled: boolean;
}

/** One ShiftRequirement of the target Schedule. */
export interface ProposalNeed {
  shiftRequirementId: ShiftRequirementId;
  shiftId: ShiftId;
  roleId: RoleId;
  peopleNeeded: number;
}

/** An active Ministry member who was asked for availability this Cycle. */
export interface ProposalVolunteer {
  volunteerId: VolunteerId;
  /** Role qualifications held in the target Ministry. */
  roleIds: RoleId[];
  availability: 'confirmed' | 'not_confirmed';
  unavailableShiftIds: ShiftId[];
}

/** An active Assignment of a candidate, in any Ministry. */
export interface ProposalAssignment {
  volunteerId: VolunteerId;
  shiftId: ShiftId;
  startTime: Instant;
  endTime: Instant;
  /** Set when it fills one of the target Schedule's needs. */
  shiftRequirementId?: ShiftRequirementId;
  /** It belongs to the target Cycle (counts as workload). */
  inCycle: boolean;
}

export interface ProposeAssignmentsInput {
  now: Instant;
  shifts: ProposalShift[];
  needs: ProposalNeed[];
  volunteers: ProposalVolunteer[];
  assignments: ProposalAssignment[];
}

export const VOLUNTEER_DECIDING_RULE_OPTIONS = [
  'only_candidate',
  'fewest_eligible_shifts',
  'fewest_cycle_assignments',
  'stable_order',
] as const;
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

export const EMPTY_PROPOSAL_REASON_OPTIONS = [
  'no_open_needs',
  'no_confirmed_responses',
  'no_eligible_placements',
] as const;
export type EmptyProposalReason =
  (typeof EMPTY_PROPOSAL_REASON_OPTIONS)[number];

export interface AssignmentProposal {
  additions: ProposedAddition[];
  gaps: ProposalGap[];
  /** Asked Volunteers whose availability is not confirmed yet. */
  excludedUnconfirmedCount: number;
  emptyReason: EmptyProposalReason | null;
}

interface OpenNeed extends ProposalNeed {
  shift: ProposalShift;
  remaining: number;
}

interface Booking {
  shiftId: ShiftId;
  startTime: Instant;
  endTime: Instant;
  inCycle: boolean;
}

interface Candidate {
  volunteer: ProposalVolunteer;
  bookings: Booking[];
}

interface Placement {
  candidate: Candidate;
  need: OpenNeed;
}

/** What ranking may look at for one Volunteer. */
interface VolunteerStanding {
  volunteerId: VolunteerId;
  eligibleShiftCount: number;
  cycleAssignmentCount: number;
}

/** What ranking may look at for one need. */
interface NeedStanding {
  need: OpenNeed;
  candidateCount: number;
}

interface CompareInput<T> {
  left: T;
  right: T;
}

interface RankingRule<T, Name extends string = string> {
  name: Name;
  compare: (input: CompareInput<T>) => number;
}

interface EligibilityInput {
  candidate: Candidate;
  need: OpenNeed;
}

interface ShiftOpenInput {
  shift: ProposalShift;
  now: Instant;
}

// ── Eligibility (mandatory; independent of ranking) ─────────────────────────

/** Started, cancelled and past Shifts take no new Assignments. */
function isShiftOpen({ shift, now }: ShiftOpenInput): boolean {
  return (
    !shift.cancelled &&
    compareInstants({ left: shift.startTime, right: now }) > 0
  );
}

function hasRemainingHeadcount({ need }: EligibilityInput): boolean {
  return need.remaining > 0;
}

/** Never infer availability from an unanswered check. */
function hasConfirmedAvailability({ candidate }: EligibilityInput): boolean {
  return candidate.volunteer.availability === 'confirmed';
}

function holdsRequiredRole({ candidate, need }: EligibilityInput): boolean {
  return candidate.volunteer.roleIds.includes(need.roleId);
}

function isAvailableForShift({ candidate, need }: EligibilityInput): boolean {
  return !candidate.volunteer.unavailableShiftIds.includes(need.shiftId);
}

/** One Assignment per Shift, and no overlap in any Ministry (existing or proposed). */
function isFreeForShift({ candidate, need }: EligibilityInput): boolean {
  const { shift } = need;
  return candidate.bookings.every(
    (booking) =>
      booking.shiftId !== shift.shiftId &&
      !(
        compareInstants({ left: shift.startTime, right: booking.endTime }) <
          0 &&
        compareInstants({ left: shift.endTime, right: booking.startTime }) > 0
      ),
  );
}

const ELIGIBILITY_RULES = [
  hasRemainingHeadcount,
  hasConfirmedAvailability,
  holdsRequiredRole,
  isAvailableForShift,
  isFreeForShift,
];

function isEligible(input: EligibilityInput): boolean {
  return ELIGIBILITY_RULES.every((rule) => rule(input));
}

// ── Ranking (policy; edit these lists to change priority) ───────────────────

/** Ids compare by code unit, never by locale, so order is reproducible. */
function compareIds({ left, right }: CompareInput<string>): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Volunteer scarcity first: who has the fewest places left to serve. */
const VOLUNTEER_RANKING: RankingRule<
  VolunteerStanding,
  Exclude<VolunteerDecidingRule, 'only_candidate'>
>[] = [
  {
    name: 'fewest_eligible_shifts',
    compare: ({ left, right }) =>
      left.eligibleShiftCount - right.eligibleShiftCount,
  },
  {
    name: 'fewest_cycle_assignments',
    compare: ({ left, right }) =>
      left.cycleAssignmentCount - right.cycleAssignmentCount,
  },
  {
    name: 'stable_order',
    compare: ({ left, right }) =>
      compareIds({ left: left.volunteerId, right: right.volunteerId }),
  },
];

/** Then, for that Volunteer, the need fewest others could fill. */
const NEED_RANKING: RankingRule<NeedStanding>[] = [
  {
    name: 'fewest_eligible_volunteers',
    compare: ({ left, right }) => left.candidateCount - right.candidateCount,
  },
  {
    name: 'earliest_shift',
    compare: ({ left, right }) =>
      compareInstants({
        left: left.need.shift.startTime,
        right: right.need.shift.startTime,
      }),
  },
  {
    name: 'stable_order',
    compare: ({ left, right }) =>
      compareIds({
        left: left.need.shiftRequirementId,
        right: right.need.shiftRequirementId,
      }),
  },
];

interface RankInput<T> {
  items: T[];
  rules: RankingRule<T>[];
}

function rank<T>({ items, rules }: RankInput<T>): T[] {
  return [...items].sort((left, right) => {
    for (const rule of rules) {
      const order = rule.compare({ left, right });
      if (order !== 0) return order;
    }
    return 0;
  });
}

interface DecidingRuleInput {
  ranked: VolunteerStanding[];
}

function decidingRule({ ranked }: DecidingRuleInput): VolunteerDecidingRule {
  const [chosen, runnerUp] = ranked;
  if (!(chosen && runnerUp)) return 'only_candidate';
  const rule = VOLUNTEER_RANKING.find(
    ({ compare }) => compare({ left: chosen, right: runnerUp }) !== 0,
  );
  return rule?.name ?? 'stable_order';
}

// ── Composition ─────────────────────────────────────────────────────────────

interface BookingsInput {
  assignments: ProposalAssignment[];
}

function bookingsOf({
  assignments,
}: BookingsInput): Map<VolunteerId, Booking[]> {
  const byVolunteer = new Map<VolunteerId, Booking[]>();
  for (const {
    volunteerId,
    shiftId,
    startTime,
    endTime,
    inCycle,
  } of assignments) {
    const bookings = byVolunteer.get(volunteerId) ?? [];
    bookings.push({ shiftId, startTime, endTime, inCycle });
    byVolunteer.set(volunteerId, bookings);
  }
  return byVolunteer;
}

interface OpenNeedsInput {
  input: ProposeAssignmentsInput;
}

function openNeedsOf({ input }: OpenNeedsInput): OpenNeed[] {
  const { now, shifts, needs, assignments } = input;
  const shiftById = new Map(shifts.map((shift) => [shift.shiftId, shift]));
  const filled = new Map<ShiftRequirementId, number>();
  for (const { shiftRequirementId } of assignments) {
    if (shiftRequirementId)
      filled.set(shiftRequirementId, (filled.get(shiftRequirementId) ?? 0) + 1);
  }
  return needs.flatMap((need) => {
    const shift = shiftById.get(need.shiftId);
    if (!(shift && isShiftOpen({ shift, now }))) return [];
    const remaining =
      need.peopleNeeded - (filled.get(need.shiftRequirementId) ?? 0);
    return [{ ...need, shift, remaining: Math.max(remaining, 0) }];
  });
}

interface PlacementsInput {
  candidates: Candidate[];
  needs: OpenNeed[];
}

function eligiblePlacements({
  candidates,
  needs,
}: PlacementsInput): Placement[] {
  return candidates.flatMap((candidate) =>
    needs
      .filter((need) => isEligible({ candidate, need }))
      .map((need) => ({ candidate, need })),
  );
}

interface ChooseInput {
  placements: Placement[];
}

interface Choice {
  placement: Placement;
  reason: ProposedAdditionReason;
}

/** Null when no eligible placement remains. */
function choosePlacement({ placements }: ChooseInput): Choice | null {
  const shiftsByVolunteer = new Map<VolunteerId, Set<ShiftId>>();
  const volunteersByNeed = new Map<ShiftRequirementId, Set<VolunteerId>>();
  for (const { candidate, need } of placements) {
    const { volunteerId } = candidate.volunteer;
    const shiftIds = shiftsByVolunteer.get(volunteerId) ?? new Set();
    shiftsByVolunteer.set(volunteerId, shiftIds.add(need.shiftId));
    const volunteerIds =
      volunteersByNeed.get(need.shiftRequirementId) ?? new Set();
    volunteersByNeed.set(
      need.shiftRequirementId,
      volunteerIds.add(volunteerId),
    );
  }

  const candidates = new Map(
    placements.map(({ candidate }) => [
      candidate.volunteer.volunteerId,
      candidate,
    ]),
  );
  const standings: VolunteerStanding[] = [...candidates.values()].map(
    ({ volunteer, bookings }) => ({
      volunteerId: volunteer.volunteerId,
      eligibleShiftCount:
        shiftsByVolunteer.get(volunteer.volunteerId)?.size ?? 0,
      cycleAssignmentCount: bookings.filter(({ inCycle }) => inCycle).length,
    }),
  );
  const rankedVolunteers = rank({ items: standings, rules: VOLUNTEER_RANKING });
  const [chosen] = rankedVolunteers;
  if (!chosen) return null;

  const needStandings: NeedStanding[] = placements
    .filter(
      ({ candidate }) => candidate.volunteer.volunteerId === chosen.volunteerId,
    )
    .map(({ need }) => ({
      need,
      candidateCount: volunteersByNeed.get(need.shiftRequirementId)?.size ?? 0,
    }));
  const [chosenNeed] = rank({ items: needStandings, rules: NEED_RANKING });
  const candidate = candidates.get(chosen.volunteerId);
  if (!(chosenNeed && candidate)) return null;

  return {
    placement: { candidate, need: chosenNeed.need },
    reason: {
      eligibleShiftCount: chosen.eligibleShiftCount,
      needCandidateCount: chosenNeed.candidateCount,
      decidedBy: decidingRule({ ranked: rankedVolunteers }),
    },
  };
}

interface EmptyReasonInput {
  needs: OpenNeed[];
  candidates: Candidate[];
}

function explainEmpty({
  needs,
  candidates,
}: EmptyReasonInput): EmptyProposalReason {
  if (!needs.some(({ remaining }) => remaining > 0)) return 'no_open_needs';
  const anyConfirmed = candidates.some(
    ({ volunteer }) => volunteer.availability === 'confirmed',
  );
  return anyConfirmed ? 'no_eligible_placements' : 'no_confirmed_responses';
}

/**
 * Repeat until no eligible placement remains: pick the scarcest Volunteer,
 * place them on their scarcest need, then recompute everything. Greedy and
 * deterministic; it does not guarantee maximum coverage.
 */
export function proposeAssignments(
  input: ProposeAssignmentsInput,
): AssignmentProposal {
  const needs = openNeedsOf({ input });
  const { assignments } = input;
  const bookings = bookingsOf({ assignments });
  const candidates: Candidate[] = input.volunteers.map((volunteer) => ({
    volunteer,
    bookings: bookings.get(volunteer.volunteerId) ?? [],
  }));
  const additions: ProposedAddition[] = [];

  for (;;) {
    const placements = eligiblePlacements({ candidates, needs });
    const choice = choosePlacement({ placements });
    if (!choice) break;
    const { candidate, need } = choice.placement;
    const { reason } = choice;
    need.remaining -= 1;
    candidate.bookings.push({ ...need.shift, inCycle: true });
    additions.push({
      volunteerId: candidate.volunteer.volunteerId,
      shiftRequirementId: need.shiftRequirementId,
      shiftId: need.shiftId,
      reason,
    });
  }

  return {
    additions,
    gaps: needs
      .filter(({ remaining }) => remaining > 0)
      .map(({ shiftRequirementId, shiftId, remaining }) => ({
        shiftRequirementId,
        shiftId,
        remaining,
      })),
    excludedUnconfirmedCount: input.volunteers.filter(
      ({ availability }) => availability === 'not_confirmed',
    ).length,
    emptyReason:
      additions.length === 0 ? explainEmpty({ needs, candidates }) : null,
  };
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

/**
 * The reviewed pairs that fail a mandatory eligibility rule against current
 * facts, in submission order; earlier pairs count as bookings and filled
 * places for later ones. Ranking is not rechecked.
 */
export function findStaleAdditions({
  facts,
  additions,
}: FindStaleAdditionsInput): ReviewedAddition[] {
  const needs = new Map(
    openNeedsOf({ input: facts }).map((need) => [
      need.shiftRequirementId,
      need,
    ]),
  );
  const bookings = bookingsOf({ assignments: facts.assignments });
  const candidates = new Map(
    facts.volunteers.map((volunteer): [VolunteerId, Candidate] => [
      volunteer.volunteerId,
      { volunteer, bookings: bookings.get(volunteer.volunteerId) ?? [] },
    ]),
  );
  return additions.filter(({ volunteerId, shiftRequirementId }) => {
    const need = needs.get(shiftRequirementId);
    const candidate = candidates.get(volunteerId);
    if (!(need && candidate && isEligible({ candidate, need }))) return true;
    need.remaining -= 1;
    candidate.bookings.push({ ...need.shift, inCycle: true });
    return false;
  });
}

export interface ProposalReviewTokenInput {
  cycleId: string;
  ministryId: string;
  additions: ReviewedAddition[];
}

/** Fingerprint of the reviewed scope and pairs (ADR 0013); order-independent. */
export function proposalReviewTokenFor({
  cycleId,
  ministryId,
  additions,
}: ProposalReviewTokenInput): string {
  const pairs = additions
    .map(
      ({ shiftRequirementId, volunteerId }) =>
        `${shiftRequirementId as string}:${volunteerId as string}`,
    )
    .sort();
  const facts = JSON.stringify([cycleId, ministryId, pairs]);
  return createHash('sha256').update(facts).digest('base64url');
}
