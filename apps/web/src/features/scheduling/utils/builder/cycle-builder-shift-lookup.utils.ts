import {
  type CycleBuilderData,
  type CycleBuilderEventSummary,
  type CycleBuilderShiftSummary,
  type CycleBuilderSlotSummary,
  isActiveAssignment,
} from '../../hooks/use-cycle-builder';

interface FindShiftByIdInput {
  data: CycleBuilderData;
  shiftId: string;
}

/** The shift with this id anywhere in the cycle, or undefined. */
export function findShiftById({
  data,
  shiftId,
}: FindShiftByIdInput): CycleBuilderShiftSummary | undefined {
  return data.events
    .flatMap((event) => event.slots)
    .flatMap((slot) => slot.shifts)
    .find((shift) => shift.shiftId === shiftId);
}

export interface ShiftContext {
  event: CycleBuilderEventSummary;
  slot: CycleBuilderSlotSummary;
  shift: CycleBuilderShiftSummary;
}

interface FindShiftContextByIdInput {
  data: CycleBuilderData;
  shiftId: string;
}

/**
 * The shift plus the event and slot that own it — enough to build a focus label
 * that names the date and event, so "Sound · Main Service" cannot stand for four
 * different slots in a weekly cycle (B-7).
 */
export function findShiftContextById({
  data,
  shiftId,
}: FindShiftContextByIdInput): ShiftContext | undefined {
  for (const event of data.events) {
    for (const slot of event.slots) {
      for (const shift of slot.shifts) {
        if (shift.shiftId === shiftId) return { event, slot, shift };
      }
    }
  }
  return undefined;
}

interface RoleHasRoomInput {
  shift: CycleBuilderShiftSummary;
  roleId: string;
}

/**
 * Whether a role on this shift can still take an assignment — its required
 * headcount above its active assignments. The single home for the ceiling the
 * board enforces cell-side as `canAdd`, so the rail's direct-assign cannot
 * over-fill a role the board would have refused.
 */
export function roleHasRoom({ shift, roleId }: RoleHasRoomInput): boolean {
  const required =
    shift.requirements.find((requirement) => requirement.roleId === roleId)
      ?.requiredCount ?? 0;
  const active = shift.assignments.filter(
    (assignment) =>
      assignment.roleId === roleId &&
      isActiveAssignment({ status: assignment.status }),
  ).length;
  return required > active;
}

interface FocusKeyInput {
  shiftId: string;
  roleId: string;
}

/**
 * Identity of one assignable place on the board. A slot can hold several shifts
 * and each shift asks for several roles, so only the pair identifies what the
 * rail is ranking for — focusing one cell must not light up its siblings.
 */
export function focusKey({ shiftId, roleId }: FocusKeyInput): string {
  return `${shiftId}:${roleId}`;
}

/**
 * The shift×role the rail is currently ranking people for. A slot can hold
 * several shifts and every shift×role pair is its own assignable place, so
 * `key` carries both — focusing one cell must not light up its siblings.
 * `ids` is ranked best-first rather than a plain set, and `idealVolunteerId`
 * is the top of that ranking who is actually free to take the slot. Both come
 * out of `rankVolunteersForShiftRole`, which reads the same
 * `shiftRoleFitForEligibleVolunteer` predicate the picker and the board read —
 * that shared rule, not a shared sort, is what stops the rail and the picker
 * disagreeing about who is a candidate at all.
 */
export interface FocusedShift {
  key: string;
  label: string;
  /** The assignable place, so the rail can commit a pick straight to it. */
  shiftId: string;
  roleId: string;
  /** The role's own name, for copy that must not read "this role" (B-2). */
  roleLabel: string;
  slotLabel: string;
  ids: string[];
  idealVolunteerId?: string;
}

interface BuildFocusLabelInput {
  roleLabel: string;
  slotLabel: string;
  eventTitle: string;
  dateText: string;
}

/**
 * The rail's "who am I ranking for" heading. It carries the event and date, not
 * just role + slot: "Sound · Main Service" alone stands for four different slots
 * across a weekly cycle, so the leader could not tell which one the rail was
 * ranking for (B-7). Shared by the board grid (click-to-focus) and the matrix
 * shell's own drop handler (drag-to-focus) — both build the same `FocusedShift`.
 */
export function buildFocusLabel({
  roleLabel,
  slotLabel,
  eventTitle,
  dateText,
}: BuildFocusLabelInput): string {
  return `${roleLabel} · ${slotLabel} · ${eventTitle} · ${dateText}`;
}
