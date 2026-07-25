import {
  type CycleBuilderData,
  type CycleBuilderShiftSummary,
  isActiveAssignment,
} from '../../hooks/use-cycle-builder';
import type {
  PickerVolunteer,
  ServingAssignmentContext,
  SuggestedVolunteer,
} from './cycle-builder-candidate.types';
import { dateLabel, timeLabel } from './cycle-builder-date.utils';
import {
  type AssignableFitTier,
  isRecommendableFit,
  shiftRoleFitForEligibleVolunteer,
} from './cycle-builder-fit.utils';
import { focusKey } from './cycle-builder-shift-lookup.utils';

export interface ShiftAssignmentIndex {
  /** Active assignments per volunteer across the whole cycle (FR-017). */
  workload: Map<string, number>;
  /**
   * Every active, shift-bound assignment grouped by volunteer, each carrying the
   * label of the shift×role it stands in. A cell only reads this for candidates
   * it has already excluded from its own shift, so "all of this volunteer's
   * assignments" and "their assignments *elsewhere*" are the same list there.
   */
  activeAssignmentsByVolunteerId: Map<string, ServingAssignmentContext[]>;
}

interface BuildShiftAssignmentIndexInput {
  data: CycleBuilderData;
}

interface AssignedVolunteerIdsForShiftInput {
  shift: CycleBuilderShiftSummary;
}

/**
 * The one scan of `data.assignments` the board used to run per role per shift
 * per column. `candidates()` and `recommendations()` each rebuilt the workload
 * map and the shift-context map on every call; both derive only from `data`, so
 * they are hoisted here and memoized once per query payload (B-6). Cost drops
 * from O(cells × assignments) per render to O(assignments) once.
 */
export function buildShiftAssignmentIndex({
  data,
}: BuildShiftAssignmentIndexInput): ShiftAssignmentIndex {
  const shiftContextById = new Map<string, ServingAssignmentContext>();
  const roleNameById = new Map(data.roles.map((role) => [role.id, role.name]));
  for (const event of data.events) {
    for (const slot of event.slots) {
      for (const candidateShift of slot.shifts) {
        const timeRange = `${timeLabel(candidateShift.startTime)}–${timeLabel(candidateShift.endTime)}`;
        const shiftLabel =
          candidateShift.label != null
            ? `${candidateShift.label} · ${timeRange}`
            : timeRange;
        shiftContextById.set(candidateShift.shiftId, {
          summary: `${dateLabel(event.startDate)} · ${shiftLabel}`,
          detail: `${event.title} · ${dateLabel(event.startDate)} · ${shiftLabel}`,
        });
      }
    }
  }

  const workload = new Map<string, number>();
  const activeAssignmentsByVolunteerId = new Map<
    string,
    ServingAssignmentContext[]
  >();
  for (const assignment of data.assignments) {
    if (!isActiveAssignment({ status: assignment.status })) {
      continue;
    }
    workload.set(
      assignment.volunteerId,
      (workload.get(assignment.volunteerId) ?? 0) + 1,
    );
    if (!assignment.shiftId) {
      continue;
    }
    const shiftContext = shiftContextById.get(assignment.shiftId);
    if (!shiftContext) {
      continue;
    }
    const roleLabel = roleNameById.get(assignment.roleId) ?? 'Role';
    const context = {
      summary: `${shiftContext.summary} · ${roleLabel}`,
      detail: `${shiftContext.detail} · ${roleLabel}`,
    };
    const existing = activeAssignmentsByVolunteerId.get(assignment.volunteerId);
    activeAssignmentsByVolunteerId.set(assignment.volunteerId, [
      ...(existing ?? []),
      context,
    ]);
  }

  return { workload, activeAssignmentsByVolunteerId };
}

/**
 * Volunteers holding an active assignment in this shift, in any role. Read off
 * the shift's own rows (the same source `rankVolunteersForShiftRole` trusts),
 * so it costs nothing beyond the shift instead of a cycle-wide scan.
 */
export function assignedVolunteerIdsForShift({
  shift,
}: AssignedVolunteerIdsForShiftInput): Set<string> {
  const assignedVolunteerIds = new Set<string>();
  for (const assignment of shift.assignments) {
    if (isActiveAssignment({ status: assignment.status })) {
      assignedVolunteerIds.add(assignment.volunteerId);
    }
  }
  return assignedVolunteerIds;
}

interface ShiftRoleCandidatesInput {
  shift: CycleBuilderShiftSummary;
  roleId: string;
  index: ShiftAssignmentIndex;
}

export function candidates({
  shift,
  roleId,
  index,
}: ShiftRoleCandidatesInput): PickerVolunteer[] {
  const assignedVolunteerIds = assignedVolunteerIdsForShift({ shift });
  // No assignability filter: everyone in `shift.eligibleVolunteers` is by
  // definition a candidate for it, which is what `EligibleShiftRoleFit`
  // encodes. The `isAssignableFit()` call that used to sit here could never
  // remove anyone — it read as a safety net while doing nothing.
  return shift.eligibleVolunteers
    .filter((volunteer) => !assignedVolunteerIds.has(volunteer.volunteerId))
    .map((volunteer) => ({
      volunteer,
      fit: shiftRoleFitForEligibleVolunteer({ volunteer, roleId }),
    }))
    .map(({ volunteer, fit }) => ({
      id: volunteer.volunteerId,
      name: volunteer.volunteerName,
      availabilityStatus: volunteer.hasConflict
        ? 'unavailable'
        : volunteer.isAvailable
          ? 'available'
          : 'no_response',
      // Not filtered out (B-2): the picker still lists an unqualified
      // candidate, badged so the pick reads as needing a reason rather than
      // being a free one.
      isQualified: fit.tier !== 'unqualified',
      // A candidate is never assigned to *this* shift (filtered above), so all
      // of their active assignments are elsewhere — the shift-scoped "other"
      // map and the cycle-wide one coincide here.
      alreadyAssignedCount: index.workload.get(volunteer.volunteerId) ?? 0,
      alreadyServingAssignments: index.activeAssignmentsByVolunteerId.get(
        volunteer.volunteerId,
      ),
    }));
}

interface ShiftRoleRecommendationsInput {
  shift: CycleBuilderShiftSummary;
  roleId: string;
  index: ShiftAssignmentIndex;
}

/**
 * The picker's suggestion groups. Recommending is a stronger claim than
 * listing, so only `ready`/`override` fits reach these groups — `unqualified`
 * is excluded here even though it is assignable elsewhere (`candidates()`,
 * the rail): nobody is ever *recommended* into a reason dialog they did not
 * go looking for. That narrower bar is `isRecommendableFit()`, shared rather
 * than spelled out inline, so this consumer cannot drift from the other two.
 */
export function recommendations({
  shift,
  roleId,
  index,
}: ShiftRoleRecommendationsInput) {
  const assignedVolunteerIds = assignedVolunteerIdsForShift({ shift });
  const toSuggestion = (
    volunteer: (typeof shift.eligibleVolunteers)[number],
    status: SuggestedVolunteer['status'],
  ): SuggestedVolunteer => ({
    id: volunteer.volunteerId,
    name: volunteer.volunteerName,
    status,
    workloadCount: index.workload.get(volunteer.volunteerId) ?? 0,
    conflictType: volunteer.hasConflict ? 'double_booked' : 'unavailable',
    alreadyServingAssignments: index.activeAssignmentsByVolunteerId.get(
      volunteer.volunteerId,
    ),
  });
  const eligible = shift.eligibleVolunteers.filter(
    (volunteer) =>
      isRecommendableFit({
        fit: shiftRoleFitForEligibleVolunteer({ volunteer, roleId }),
      }) && !assignedVolunteerIds.has(volunteer.volunteerId),
  );
  return {
    safe: eligible
      .filter((volunteer) => volunteer.isAvailable && !volunteer.hasConflict)
      .sort((left, right) => {
        const served =
          (left.lastServedAt ? new Date(left.lastServedAt).getTime() : 0) -
          (right.lastServedAt ? new Date(right.lastServedAt).getTime() : 0);
        return (
          served ||
          (index.workload.get(left.volunteerId) ?? 0) -
            (index.workload.get(right.volunteerId) ?? 0) ||
          left.volunteerName.localeCompare(right.volunteerName)
        );
      })
      .slice(0, 5)
      .map((volunteer) => toSuggestion(volunteer, 'available')),
    needsResponse: eligible
      .filter((volunteer) => !volunteer.isAvailable && !volunteer.hasConflict)
      .slice(0, 5)
      .map((volunteer) => toSuggestion(volunteer, 'needs_response')),
    conflicts: eligible
      .filter((volunteer) => volunteer.hasConflict)
      .slice(0, 5)
      .map((volunteer) => toSuggestion(volunteer, 'conflict')),
  };
}

interface AssignableFitsInput {
  shift: CycleBuilderShiftSummary;
  roleId: string;
  excludedVolunteerIds: Set<string> | null;
}

/**
 * Who the rail may commit to one shift×role, and at what tier. The rail cannot
 * see the board's assignment state, so the tier has to travel with the id —
 * that is what lets a card render "Pick me" as a warning for a pick that will
 * demand an override reason.
 *
 * Includes `unqualified` (B-2): "Pick me" offers everyone in the eligible pool,
 * rendering a costly pick as a warning rather than hiding the person.
 */
export function assignableFits({
  shift,
  roleId,
  excludedVolunteerIds,
}: AssignableFitsInput): Map<string, AssignableFitTier> {
  const fits = new Map<string, AssignableFitTier>();
  for (const volunteer of shift.eligibleVolunteers) {
    if (excludedVolunteerIds?.has(volunteer.volunteerId)) continue;
    // `EligibleShiftRoleFit['tier']` *is* `AssignableFitTier`, so this needs no
    // guard and no cast — the previous `isAssignableFit()` test could never
    // fail, and the `as AssignableFitTier` only existed to paper over the
    // widened return type it was checking against.
    const { tier } = shiftRoleFitForEligibleVolunteer({ volunteer, roleId });
    fits.set(volunteer.volunteerId, tier);
  }
  return fits;
}

export interface CellDerived {
  candidates: PickerVolunteer[];
  recommendations: ReturnType<typeof recommendations>;
}

interface BuildCellDerivedIndexInput {
  data: CycleBuilderData;
  index: ShiftAssignmentIndex;
}

/**
 * `candidates()`/`recommendations()` for every shift×role in the payload,
 * computed once here instead of inline in the render's JSX map. Both are pure
 * functions of a shift, a roleId and `shiftAssignmentIndex` — none of which
 * change on a rail selection, a date filter, or opening the filter toolbar —
 * so calling them straight from JSX on every render redid this work for every
 * visible cell regardless of what actually changed.
 */
export function buildCellDerivedIndex({
  data,
  index,
}: BuildCellDerivedIndexInput): Map<string, CellDerived> {
  const byKey = new Map<string, CellDerived>();
  for (const event of data.events) {
    for (const slot of event.slots) {
      for (const shift of slot.shifts) {
        for (const requirement of shift.requirements) {
          byKey.set(
            focusKey({ shiftId: shift.shiftId, roleId: requirement.roleId }),
            {
              candidates: candidates({
                shift,
                roleId: requirement.roleId,
                index,
              }),
              recommendations: recommendations({
                shift,
                roleId: requirement.roleId,
                index,
              }),
            },
          );
        }
      }
    }
  }
  return byKey;
}
