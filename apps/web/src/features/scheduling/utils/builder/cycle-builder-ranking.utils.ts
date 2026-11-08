import {
  type CycleBuilderAssignment,
  type CycleBuilderEligibleVolunteerSummary,
  type CycleBuilderShiftSummary,
  isActiveAssignment,
} from '../../hooks/use-cycle-builder';
import { lastServedMillis } from './cycle-builder-date.utils';
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
): number =>
  ['available', 'unanswered', 'not_asked', 'unavailable'].indexOf(
    volunteer.answerState,
  );

interface LastServedAtInput {
  volunteer: CycleBuilderEligibleVolunteerSummary;
}

const lastServedAt = ({ volunteer }: LastServedAtInput): number =>
  lastServedMillis({ lastServedAt: volunteer.lastServedAt });

/** Rank Role holders for the focused Shift. */
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
    .filter(
      (volunteer) =>
        !assignedVolunteerIds.has(volunteer.volunteerId) &&
        volunteer.qualifiedRoleIds.includes(roleId),
    )
    .sort(
      (left, right) =>
        availabilityRank(left) - availabilityRank(right) ||
        lastServedAt({ volunteer: left }) -
          lastServedAt({ volunteer: right }) ||
        (workload.get(left.volunteerId) ?? 0) -
          (workload.get(right.volunteerId) ?? 0) ||
        left.volunteerName.localeCompare(right.volunteerName),
    );

  return {
    ids: ranked.map((volunteer) => volunteer.volunteerId),
    idealVolunteerId: ranked.find(
      (volunteer) =>
        volunteer.answerState === 'available' &&
        shiftRoleFitForEligibleVolunteer({ volunteer, roleId }).tier ===
          'ready' &&
        (workload.get(volunteer.volunteerId) ?? 0) === 0,
    )?.volunteerId,
  };
}
