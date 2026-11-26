import { compareInstants, type Instant, parseInstant } from '@church/time';
import type { CycleBuilderShiftSummary } from '../hooks/use-cycle-builder';

/** Whether a leader can act on a Shift or ShiftRequirement now, or why not.
 * When several reasons hold, the first of cancelled, started, full and no role
 * holder is the one given. */
export type ShiftVerdict =
  | 'actionable'
  | 'cancelled'
  | 'started'
  | 'full'
  | 'no_role_holder';

interface VerdictRequirement {
  roleId: string;
  /** Fewer active Assignments than people needed. */
  hasRoom: boolean;
}

interface ShiftVerdictInput {
  shift: Pick<
    CycleBuilderShiftSummary,
    'cancelled' | 'startTime' | 'eligibleVolunteers'
  >;
  currentInstant: Instant;
  /** Omit to ask about the Shift as a whole. */
  requirement?: VerdictRequirement;
}

export function shiftVerdict({
  shift,
  currentInstant,
  requirement,
}: ShiftVerdictInput): ShiftVerdict {
  const { cancelled, startTime, eligibleVolunteers } = shift;
  if (cancelled) return 'cancelled';
  const start = parseInstant({ value: startTime });
  if (compareInstants({ left: start, right: currentInstant }) <= 0)
    return 'started';
  if (!requirement) return 'actionable';
  const { roleId, hasRoom } = requirement;
  if (!hasRoom) return 'full';
  if (lacksRoleHolder({ eligibleVolunteers, roleId })) return 'no_role_holder';
  return 'actionable';
}

interface VerdictInput {
  verdict: ShiftVerdict;
}

/** Existing Assignments may be moved or removed until the Shift starts. */
export function allowsChanges({ verdict }: VerdictInput): boolean {
  return verdict !== 'cancelled' && verdict !== 'started';
}

/** No role holder still offers the (empty) picker; who may be picked is the
 * candidate's fit. */
export function allowsAdding({ verdict }: VerdictInput): boolean {
  return verdict === 'actionable' || verdict === 'no_role_holder';
}

interface LacksRoleHolderInput {
  eligibleVolunteers: CycleBuilderShiftSummary['eligibleVolunteers'];
  roleId: string;
}

/** Asked apart from the verdict: the board says so on started and full cells
 * too. */
export function lacksRoleHolder({
  eligibleVolunteers,
  roleId,
}: LacksRoleHolderInput): boolean {
  return !eligibleVolunteers.some((volunteer) =>
    volunteer.qualifiedRoleIds.includes(roleId),
  );
}

export interface CountedEventTimeBlock {
  included: boolean;
  cancelled: boolean;
}

/** A time block asks for people only when this Ministry serves it and neither
 * it nor its Event was cancelled. A started one still counts toward coverage. */
export function isStaffedEventTimeBlock({
  included,
  cancelled,
}: CountedEventTimeBlock): boolean {
  return included && !cancelled;
}
