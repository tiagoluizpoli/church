import { createHash } from 'node:crypto';
import { compareInstants } from '@church/time';
import type {
  ShiftId,
  ShiftRequirementId,
  VolunteerId,
} from '../../branded-ids';
import { findAssignmentRefusal, isShiftOpen } from './assignment-eligibility';
import type {
  AssignmentProposal,
  Booking,
  BookingsInput,
  Candidate,
  Choice,
  ChooseInput,
  CompareInput,
  DecidingRuleInput,
  EligibilityInput,
  EmptyProposalReason,
  EmptyReasonInput,
  FindStaleAdditionsInput,
  NeedStanding,
  OpenNeed,
  OpenNeedsInput,
  Placement,
  PlacementsInput,
  ProposalReviewTokenInput,
  ProposeAssignmentsInput,
  ProposedAddition,
  RankInput,
  RankingRule,
  ReviewedAddition,
  VolunteerDecidingRule,
  VolunteerStanding,
} from './assignment-proposal.types';

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
 * Organization: the shared Assignment eligibility module
 * (`assignment-eligibility.ts`) decides whether a Volunteer may fill a need at
 * all; the two ranking lists below decide who goes first and where. Change
 * policy by editing those lists, not the loop.
 */

export const VOLUNTEER_DECIDING_RULE_OPTIONS = [
  'only_candidate',
  'fewest_eligible_shifts',
  'fewest_cycle_assignments',
  'stable_order',
] as const;

export const EMPTY_PROPOSAL_REASON_OPTIONS = [
  'no_open_needs',
  'no_confirmed_responses',
  'no_eligible_placements',
] as const;

// ── Eligibility (mandatory; independent of ranking) ─────────────────────────

/** The proposal's rule list of the shared Assignment eligibility module. */
function isEligible({ candidate, need, now }: EligibilityInput): boolean {
  const { volunteer, bookings } = candidate;
  const { requirement, shift } = need;
  return (
    findAssignmentRefusal({
      check: 'proposal',
      eligibility: {
        now,
        shift,
        requirement,
        bookings: bookings.map((booking) => booking.shift),
        facts: {
          // Open needs only: their Shifts are not cancelled.
          cancelledBy: null,
          // Candidates are the Ministry's active, asked members.
          isMember: true,
          roleIds: volunteer.roleIds,
          availability: volunteer.availability,
          unavailableShiftIds: volunteer.unavailableShiftIds,
          filled: requirement.peopleNeeded - need.remaining,
        },
      },
    }) === null
  );
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
        left: left.need.requirement.id,
        right: right.need.requirement.id,
      }),
  },
];

function rank<T>({ items, rules }: RankInput<T>): T[] {
  return [...items].sort((left, right) => {
    for (const rule of rules) {
      const order = rule.compare({ left, right });
      if (order !== 0) return order;
    }
    return 0;
  });
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

function bookingsOf({
  assignments,
}: BookingsInput): Map<VolunteerId, Booking[]> {
  const byVolunteer = new Map<VolunteerId, Booking[]>();
  for (const { assignment, shift, inCycle } of assignments) {
    const bookings = byVolunteer.get(assignment.volunteerId) ?? [];
    bookings.push({ shift, inCycle });
    byVolunteer.set(assignment.volunteerId, bookings);
  }
  return byVolunteer;
}

function openNeedsOf({ input }: OpenNeedsInput): OpenNeed[] {
  const { now, shifts, cancelledShiftIds, needs, assignments } = input;
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const cancelled = new Set(cancelledShiftIds);
  const filled = new Map<ShiftRequirementId, number>();
  for (const { assignment } of assignments) {
    const { shiftRequirementId } = assignment;
    filled.set(shiftRequirementId, (filled.get(shiftRequirementId) ?? 0) + 1);
  }
  return needs.flatMap((requirement) => {
    const shift = requirement.shiftId && shiftById.get(requirement.shiftId);
    if (!shift) return [];
    const cancelledBy = cancelled.has(shift.id) ? 'event_time_block' : null;
    if (!isShiftOpen({ shift, cancelledBy, now })) return [];
    const remaining =
      requirement.peopleNeeded - (filled.get(requirement.id) ?? 0);
    return [{ requirement, shift, remaining: Math.max(remaining, 0) }];
  });
}

function eligiblePlacements({
  candidates,
  needs,
  now,
}: PlacementsInput): Placement[] {
  return candidates.flatMap((candidate) =>
    needs
      .filter((need) => isEligible({ candidate, need, now }))
      .map((need) => ({ candidate, need })),
  );
}

/** Null when no eligible placement remains. */
function choosePlacement({ placements }: ChooseInput): Choice | null {
  const shiftsByVolunteer = new Map<VolunteerId, Set<ShiftId>>();
  const volunteersByNeed = new Map<ShiftRequirementId, Set<VolunteerId>>();
  for (const { candidate, need } of placements) {
    const { volunteerId } = candidate.volunteer;
    const shiftIds = shiftsByVolunteer.get(volunteerId) ?? new Set();
    shiftsByVolunteer.set(volunteerId, shiftIds.add(need.shift.id));
    const volunteerIds = volunteersByNeed.get(need.requirement.id) ?? new Set();
    volunteersByNeed.set(need.requirement.id, volunteerIds.add(volunteerId));
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
      candidateCount: volunteersByNeed.get(need.requirement.id)?.size ?? 0,
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
    const placements = eligiblePlacements({
      candidates,
      needs,
      now: input.now,
    });
    const choice = choosePlacement({ placements });
    if (!choice) break;
    const { candidate, need } = choice.placement;
    const { reason } = choice;
    need.remaining -= 1;
    candidate.bookings.push({ shift: need.shift, inCycle: true });
    additions.push({
      volunteerId: candidate.volunteer.volunteerId,
      shiftRequirementId: need.requirement.id,
      shiftId: need.shift.id,
      reason,
    });
  }

  return {
    additions,
    gaps: needs
      .filter(({ remaining }) => remaining > 0)
      .map(({ requirement, shift, remaining }) => ({
        shiftRequirementId: requirement.id,
        shiftId: shift.id,
        remaining,
      })),
    excludedUnconfirmedCount: input.volunteers.filter(
      ({ availability }) => availability === 'not_confirmed',
    ).length,
    emptyReason:
      additions.length === 0 ? explainEmpty({ needs, candidates }) : null,
  };
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
    openNeedsOf({ input: facts }).map((need) => [need.requirement.id, need]),
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
    if (!(need && candidate && isEligible({ candidate, need, now: facts.now })))
      return true;
    need.remaining -= 1;
    candidate.bookings.push({ shift: need.shift, inCycle: true });
    return false;
  });
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
