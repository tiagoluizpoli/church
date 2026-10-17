import type { CycleBuilderData } from '../../hooks/use-cycle-builder';

interface RequirementCoverage {
  id: string;
  peopleNeeded: number;
}

interface AssignmentCoverage {
  shiftRequirementId: string;
  status: string;
}

interface CountCoveredPlacesInput {
  requirements: readonly RequirementCoverage[];
  assignments: readonly AssignmentCoverage[];
}

/** Overstaffing one Sector cannot fill a different Sector's places. */
export function countCoveredPlaces({
  requirements,
  assignments,
}: CountCoveredPlacesInput): number {
  const activeByRequirement = new Map<string, number>();
  for (const assignment of assignments) {
    if (assignment.status === 'declined' || assignment.status === 'cancelled')
      continue;
    const { shiftRequirementId } = assignment;
    activeByRequirement.set(
      shiftRequirementId,
      (activeByRequirement.get(shiftRequirementId) ?? 0) + 1,
    );
  }
  return requirements.reduce(
    (covered, requirement) =>
      covered +
      Math.min(
        requirement.peopleNeeded,
        activeByRequirement.get(requirement.id) ?? 0,
      ),
    0,
  );
}

export interface CycleStaffingSummary {
  /** Active assignments standing against the cycle's included shifts. */
  filled: number;
  /** Places covered, capped per requirement; filled retains the actual Assignment total. */
  coveredPlaces: number;
  /** Headcount those shifts ask for. */
  required: number;
  /** Covered places / required, capped separately for each requirement. */
  percent: number;
  shiftsBelowTarget: number;
}

interface SummarizeCycleStaffingInput {
  data: CycleBuilderData;
}

/**
 * The one number a coordinator building a 40-assignment schedule never had: how
 * much of the cycle is done. Counted over *included* time blocks only — a time block this
 * ministry is not serving asks for nobody, so counting it would make the
 * denominator lie (B-4).
 */
export function summarizeCycleStaffing({
  data,
}: SummarizeCycleStaffingInput): CycleStaffingSummary {
  let filled = 0;
  let covered = 0;
  let required = 0;
  let shiftsBelowTarget = 0;
  for (const event of data.events) {
    for (const eventTimeBlock of event.eventTimeBlocks) {
      if (!eventTimeBlock.included) continue;
      for (const shift of eventTimeBlock.shifts) {
        const coveredPlaces = countCoveredPlaces(shift);
        covered += coveredPlaces;
        filled += shift.assignedCount;
        required += shift.peopleNeeded;
        if (coveredPlaces < shift.peopleNeeded) shiftsBelowTarget += 1;
      }
    }
  }
  return {
    filled,
    coveredPlaces: covered,
    required,
    percent: required === 0 ? 0 : Math.round((covered / required) * 100),
    shiftsBelowTarget,
  };
}

export interface CycleCountsSummary {
  eventCount: number;
  /** Included time blocks only — the same scope `summarizeCycleStaffing` uses. */
  eventTimeBlockCount: number;
  shiftCount: number;
  /** Active assignments across included shifts, i.e. `staffing.filled`. */
  assignedCount: number;
}

interface SummarizeCycleCountsInput {
  data: CycleBuilderData;
  /** `summarizeCycleStaffing(...).filled` — passed in so the two summaries
   * don't each sum every shift's `assignedCount` themselves. */
  assignedCount: number;
}

/**
 * The plain inventory counters (Planning and Prepare's headers both carry
 * these) that the staffing percentage alone doesn't answer: how many events,
 * time blocks, and shifts this cycle actually has.
 */
export function summarizeCycleCounts({
  data,
  assignedCount,
}: SummarizeCycleCountsInput): CycleCountsSummary {
  let eventTimeBlockCount = 0;
  let shiftCount = 0;
  for (const event of data.events) {
    for (const eventTimeBlock of event.eventTimeBlocks) {
      if (!eventTimeBlock.included) continue;
      eventTimeBlockCount += 1;
      shiftCount += eventTimeBlock.shifts.length;
    }
  }
  return {
    eventCount: data.events.length,
    eventTimeBlockCount,
    shiftCount,
    assignedCount,
  };
}

interface StaffingStatusClassesInput {
  percent: number;
  hasRequirement: boolean;
}

export interface StaffingStatusClasses {
  text: string;
  bar: string;
}

/** Same green/amber/destructive semantic palette used for volunteer
 * availability elsewhere in the builder (assignment-picker.tsx,
 * suggestion-list.tsx) — reused so a staffing status reads at a glance instead
 * of requiring the leader to read every percentage. A date with no
 * requirements yet (no events, or events with none included) stays neutral
 * rather than flashing red — there's nothing to be missing. Shared by the date
 * strip and the cycle header so the two cannot drift apart. */
export function staffingStatusClasses({
  percent,
  hasRequirement,
}: StaffingStatusClassesInput): StaffingStatusClasses {
  if (!hasRequirement) {
    return { text: 'text-muted-foreground', bar: 'bg-muted-foreground/30' };
  }
  if (percent >= 100) {
    return { text: 'text-green-700 dark:text-green-400', bar: 'bg-green-600' };
  }
  if (percent >= 50) {
    return {
      text: 'text-yellow-700 dark:text-yellow-300',
      bar: 'bg-yellow-500',
    };
  }
  return { text: 'text-destructive', bar: 'bg-destructive' };
}
