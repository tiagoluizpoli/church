import type { CycleBuilderData } from '../../hooks/use-cycle-builder';

export interface CycleStaffingSummary {
  /** Active assignments standing against the cycle's included shifts. */
  filled: number;
  /** Headcount those shifts ask for. */
  required: number;
  /** `filled / required`, uncapped — over-staffing is worth seeing. */
  percent: number;
  shiftsBelowTarget: number;
}

interface SummarizeCycleStaffingInput {
  data: CycleBuilderData;
}

/**
 * The one number a coordinator building a 40-assignment roster never had: how
 * much of the cycle is done. Counted over *included* slots only — a slot this
 * ministry is not serving asks for nobody, so counting it would make the
 * denominator lie (B-4).
 */
export function summarizeCycleStaffing({
  data,
}: SummarizeCycleStaffingInput): CycleStaffingSummary {
  let filled = 0;
  let required = 0;
  let shiftsBelowTarget = 0;
  for (const event of data.events) {
    for (const slot of event.slots) {
      if (!slot.included) continue;
      for (const shift of slot.shifts) {
        filled += shift.assignedCount;
        required += shift.requiredCount;
        if (shift.assignedCount < shift.requiredCount) shiftsBelowTarget += 1;
      }
    }
  }
  return {
    filled,
    required,
    percent: required === 0 ? 0 : Math.round((filled / required) * 100),
    shiftsBelowTarget,
  };
}

export interface CycleCountsSummary {
  eventCount: number;
  /** Included slots only — the same scope `summarizeCycleStaffing` uses. */
  slotCount: number;
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
 * The plain inventory counters (Planning and Tailoring's headers both carry
 * these) that the staffing percentage alone doesn't answer: how many events,
 * slots, and shifts this cycle actually has.
 */
export function summarizeCycleCounts({
  data,
  assignedCount,
}: SummarizeCycleCountsInput): CycleCountsSummary {
  let slotCount = 0;
  let shiftCount = 0;
  for (const event of data.events) {
    for (const slot of event.slots) {
      if (!slot.included) continue;
      slotCount += 1;
      shiftCount += slot.shifts.length;
    }
  }
  return {
    eventCount: data.events.length,
    slotCount,
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
