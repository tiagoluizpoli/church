import {
  type CycleBuilderAssignment,
  type CycleBuilderEligibleVolunteerSummary,
  type CycleBuilderShiftSummary,
  isActiveAssignment,
} from '../../hooks/use-cycle-builder';
import { shiftRoleFitForEligibleVolunteer } from './cycle-builder-fit.utils';

interface CountWorkloadInput {
  assignments: CycleBuilderAssignment[];
}

/** Active assignments per volunteer across the whole cycle (FR-017). */
export function countWorkload({
  assignments,
}: CountWorkloadInput): Map<string, number> {
  const workload = new Map<string, number>();
  for (const assignment of assignments)
    if (isActiveAssignment({ status: assignment.status }))
      workload.set(
        assignment.volunteerId,
        (workload.get(assignment.volunteerId) ?? 0) + 1,
      );
  return workload;
}

interface RankVolunteersForShiftRoleInput {
  shift: CycleBuilderShiftSummary;
  roleId: string;
  assignments: CycleBuilderAssignment[];
}

export interface ShiftRoleRanking {
  ids: string[];
  idealVolunteerId?: string;
}

const availabilityRank = (
  volunteer: CycleBuilderEligibleVolunteerSummary,
): number => (volunteer.hasConflict ? 2 : volunteer.isAvailable ? 0 : 1);

const lastServedAt = (
  volunteer: CycleBuilderEligibleVolunteerSummary,
): number =>
  volunteer.lastServedAt ? new Date(volunteer.lastServedAt).getTime() : 0;

interface FitRankInput {
  volunteer: CycleBuilderEligibleVolunteerSummary;
  roleId: string;
}

/** Ranking weight of a fit: the safer the tier, the higher up the rail. */
function fitRank({ volunteer, roleId }: FitRankInput): number {
  const { tier } = shiftRoleFitForEligibleVolunteer({ volunteer, roleId });
  if (tier === 'ready') return 0;
  if (tier === 'override') return 1;
  return 2;
}

/**
 * Rail ordering for one shift×role: safest fit first (`shiftRoleFit` tier —
 * ready, then override, then unqualified), then whoever is available for
 * *this* shift, then longest since served, then lightest cycle load, then
 * name. People already serving this shift drop out; they cannot take it
 * twice.
 *
 * Qualification is a soft constraint with friction, not a hard filter — the
 * server itself only warns `NOT_QUALIFIED` and lets a reason clear it under
 * either enforcement mode (B-2). So the ranking keeps everyone whose fit ≠
 * `none`: the rail can never say "No candidates" while the Add picker in the
 * same cell offers someone. An unqualified pick still ends in
 * `OverrideDialog`'s `not_qualified` variant — it just is not hidden first.
 *
 * `idealVolunteerId` is the top of the ranking who is genuinely free:
 * qualified, available, unconflicted (tier `ready`) **and** carrying no other
 * active assignment in this cycle. That last clause makes it a *strictly
 * narrower* bar than `recommendations().safe`, which requires the first three
 * but only sorts by workload rather than demanding zero — so every Ideal is
 * someone the picker would also recommend, but not every safe recommendation
 * can wear the badge. Keep it that way round: the in-product tooltip promises
 * "not already serving this cycle", which is the zero-workload clause. People
 * who fail the bar keep their place in the ranking; they just go unbadged.
 */
export function rankVolunteersForShiftRole({
  shift,
  roleId,
  assignments,
}: RankVolunteersForShiftRoleInput): ShiftRoleRanking {
  const workload = countWorkload({ assignments });
  const assignedVolunteerIds = new Set(
    shift.assignments
      .filter((assignment) => isActiveAssignment({ status: assignment.status }))
      .map((assignment) => assignment.volunteerId),
  );
  const ranked = shift.eligibleVolunteers
    .filter((volunteer) => !assignedVolunteerIds.has(volunteer.volunteerId))
    .sort(
      (left, right) =>
        fitRank({ volunteer: left, roleId }) -
          fitRank({ volunteer: right, roleId }) ||
        availabilityRank(left) - availabilityRank(right) ||
        lastServedAt(left) - lastServedAt(right) ||
        (workload.get(left.volunteerId) ?? 0) -
          (workload.get(right.volunteerId) ?? 0) ||
        left.volunteerName.localeCompare(right.volunteerName),
    );

  return {
    ids: ranked.map((volunteer) => volunteer.volunteerId),
    idealVolunteerId: ranked.find(
      (volunteer) =>
        shiftRoleFitForEligibleVolunteer({ volunteer, roleId }).tier ===
          'ready' && (workload.get(volunteer.volunteerId) ?? 0) === 0,
    )?.volunteerId,
  };
}
