import type { Active, Over } from '@dnd-kit/core';
import {
  type CycleBuilderAssignment,
  type CycleBuilderData,
  type CycleBuilderEligibleVolunteerSummary,
  type CycleBuilderEventSummary,
  type CycleBuilderShiftSummary,
  type CycleBuilderSlotSummary,
  isActiveAssignment,
} from '../../hooks/use-cycle-builder';
import type { PoolVolunteer } from '../../hooks/use-volunteer-pool';
import type {
  PickerVolunteer,
  ServingAssignmentContext,
} from './assignment-picker';
import type { SuggestedVolunteer } from './suggestion-list';
import {
  type CalendarDayKey,
  toCycleDayKey,
  toLocalDayKey,
} from '@/shared/utils/date';

export const dateLabel = (date: string) =>
  new Date(`${toLocalDayKey(date)}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
export const timeLabel = (date: string) =>
  new Date(date).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

export type DateSpanMode = 'starts' | 'ends' | 'within';
export type DateMode = 'event_dates' | 'all_cycle_dates';

interface EventDayKeysInput {
  event: CycleBuilderEventSummary;
}

/**
 * Every calendar day an event covers, read in the viewer's timezone. A genuinely
 * multi-day event covers each day of its span and earns a column per day.
 *
 * The span must be measured in *local* days: a one-day event runs local midnight
 * → local 23:59, so measuring it in UTC days stretches it across two dates west
 * of UTC and grows a phantom column for the day after.
 */
export function eventDayKeys({ event }: EventDayKeysInput): CalendarDayKey[] {
  return enumerateDates({
    startDate: toLocalDayKey(event.startDate),
    endDate: toLocalDayKey(event.endDate),
  });
}

interface DeriveEventDatesInput {
  events: CycleBuilderEventSummary[];
}

export function deriveEventDates({
  events,
}: DeriveEventDatesInput): CalendarDayKey[] {
  const result = new Set<CalendarDayKey>();
  for (const event of events)
    for (const day of eventDayKeys({ event })) result.add(day);
  return [...result].sort();
}

interface EventOccursOnDayInput {
  event: CycleBuilderEventSummary;
  day: CalendarDayKey;
}

export function eventOccursOnDay({
  event,
  day,
}: EventOccursOnDayInput): boolean {
  return (
    toLocalDayKey(event.startDate) <= day && day <= toLocalDayKey(event.endDate)
  );
}

interface EventSlotsOnDayInput {
  event: CycleBuilderEventSummary;
  day: CalendarDayKey;
}

/**
 * The event's slots served on one day. A multi-day event legitimately appears
 * in several columns, so each column must narrow to its own day's slots —
 * rendering the event's whole slot list in every column would put one shift on
 * several days, and an assignment made against it would look like it had landed
 * on all of them.
 */
export function eventSlotsOnDay({
  event,
  day,
}: EventSlotsOnDayInput): CycleBuilderSlotSummary[] {
  return event.slots.filter((slot) => toLocalDayKey(slot.startTime) === day);
}

interface EnumerateDatesInput {
  startDate: string;
  endDate: string;
}

/**
 * Every calendar day from `startDate` to `endDate` inclusive. Both bounds are
 * cycle bounds, so the walk is pure day arithmetic anchored at UTC — no local
 * offset is involved in either the input or the output.
 */
export function enumerateDates({
  startDate,
  endDate,
}: EnumerateDatesInput): CalendarDayKey[] {
  const dates: CalendarDayKey[] = [];
  const current = new Date(`${toCycleDayKey(startDate)}T00:00:00.000Z`);
  const end = new Date(`${toCycleDayKey(endDate)}T00:00:00.000Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

interface IsDateWithinRangeInput {
  date: CalendarDayKey;
  rangeStart: string;
  rangeEnd: string;
}

/** Mirrors `isDateWithinRange` in tailoring's `cycle-list.utils.ts` — either
 * bound may be empty to leave that side open-ended. */
export function isDateWithinRange({
  date,
  rangeStart,
  rangeEnd,
}: IsDateWithinRangeInput): boolean {
  if (rangeStart && date < rangeStart) return false;
  if (rangeEnd && date > rangeEnd) return false;
  return true;
}

interface EventMatchesDateSpanInput {
  event: CycleBuilderEventSummary;
  mode: DateSpanMode;
  rangeStart: string;
  rangeEnd: string;
}

/** Same `starts`/`ends`/`within` mode as the tailoring cycle-list filter,
 * applied to an event's own span rather than a raw calendar date — a date
 * column has no separate start/end, so the mode only has an effect where
 * it's applied (event span), not on the enumerated all-cycle-dates list. */
export function eventMatchesDateSpan({
  event,
  mode,
  rangeStart,
  rangeEnd,
}: EventMatchesDateSpanInput): boolean {
  if (!rangeStart && !rangeEnd) return true;
  const start = toLocalDayKey(event.startDate);
  const end = toLocalDayKey(event.endDate);
  if (mode === 'starts')
    return isDateWithinRange({ date: start, rangeStart, rangeEnd });
  if (mode === 'ends')
    return isDateWithinRange({ date: end, rangeStart, rangeEnd });
  return (
    isDateWithinRange({ date: start, rangeStart, rangeEnd }) &&
    isDateWithinRange({ date: end, rangeStart, rangeEnd })
  );
}

interface WeekdayForDayKeyInput {
  day: CalendarDayKey;
}

/**
 * Weekday index of a calendar day. Anchored at local noon so the day cannot
 * slide across a midnight boundary under any offset or DST transition.
 */
export function weekdayForDayKey({ day }: WeekdayForDayKeyInput): number {
  return new Date(`${day}T12:00:00`).getDay();
}

interface WeekdayLongNameInput {
  /** 0 (Sunday) … 6 (Saturday), as returned by `weekdayForDayKey`. */
  weekday: number;
}

// 2024-01-07 is a Sunday (`getDay() === 0`); offsetting it by the weekday index
// lands on that weekday. Named and derived here so the weekday-name lookup is
// not an opaque `new Date(2026, 7, 2 + day)` magic anchor at the call site.
const WEEKDAY_NAME_ANCHOR_SUNDAY = new Date(2024, 0, 7);

/** The viewer-locale long name ("Sunday", "Monday", …) for a weekday index. */
export function weekdayLongName({ weekday }: WeekdayLongNameInput): string {
  const date = new Date(WEEKDAY_NAME_ANCHOR_SUNDAY);
  date.setDate(date.getDate() + weekday);
  return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date);
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
 * `idealVolunteerId` is the top of the ranking who is genuinely free — the
 * same bar `recommendations().safe` sets, so the badge always names someone the
 * picker would also recommend: qualified, available, unconflicted, and not
 * already serving elsewhere in the cycle. People who fail that bar keep their
 * place in the ranking; they just cannot wear the badge.
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

/**
 * How well one volunteer fits one shift×role. **This is the builder's only
 * qualification rule** — the rail's ranking, the picker's list, the picker's
 * recommendations, the board's reverse highlight and every drop target read it,
 * so no two gestures can enforce different rules (B-2).
 *
 * `ready`       — qualified and genuinely free: the obvious drop target.
 * `override`    — qualified but unavailable or double-booked. Still assignable;
 *                 overriding is a real workflow, it just must not look routine —
 *                 and FR-016 requires a reason before it is accepted, which is
 *                 why the tier carries `conflictType` rather than leaving each
 *                 caller to re-derive it. A caller holding the fit cannot drop
 *                 the conflict on the floor without the compiler noticing.
 * `unqualified` — not qualified for this role, but still assignable: the
 *                 server only warns `NOT_QUALIFIED` and a reason clears it
 *                 under either enforcement mode, so hard-filtering here would
 *                 make the rail's "the leader can overrule" stance a lie
 *                 (B-2). Ranked last and routed to `OverrideDialog`'s
 *                 `not_qualified` variant by every gesture via
 *                 `overrideKindForFit()`.
 * `none`        — not a candidate for this shift at all (not in the ministry,
 *                 not in the cycle). A hard `NOT_IN_MINISTRY` server-side, so
 *                 no gesture may offer it.
 */
export type ShiftRoleFit =
  | { tier: 'ready' }
  | { tier: 'override'; conflictType: SoftConflictType }
  | { tier: 'unqualified'; conflictType?: SoftConflictType }
  | { tier: 'none' };

/** Mirrors the picker's own conflict vocabulary (`recommendations()`). */
export type SoftConflictType = 'double_booked' | 'unavailable';

/**
 * Every tier a leader may actually commit — `ShiftRoleFit` minus `none`.
 * Includes `unqualified`: assignable with an override reason, not filtered
 * out (B-2).
 */
export type AssignableFitTier = Exclude<ShiftRoleFit['tier'], 'none'>;

/**
 * What a caller would have to justify. Builder candidates are NOT
 * qualification-filtered before this translation runs — `'not_qualified'` is
 * a real, reachable value here, not a defensive-only case (B-2). The one
 * function that does filter qualification is `recommendations()`, and only
 * for its own suggestion groups: nobody is ever *recommended* into a reason
 * they did not ask for.
 */
export type AssignmentOverrideKind = SoftConflictType | 'not_qualified';

interface OverrideKindForFitInput {
  fit: ShiftRoleFit;
}

/**
 * The one translation from "how well does she fit" to "what must she justify".
 * Every assign gesture goes through here rather than testing tiers by hand —
 * that hand-testing is precisely how "Pick me" came to commit an unqualified
 * volunteer with no dialog while the droppable refused the same person.
 */
export function overrideKindForFit({
  fit,
}: OverrideKindForFitInput): AssignmentOverrideKind | undefined {
  if (fit.tier === 'unqualified') return 'not_qualified';
  if (fit.tier === 'override') return fit.conflictType;
  return undefined;
}

interface IsAssignableFitInput {
  fit: ShiftRoleFit;
}

/**
 * Whether a leader may commit this pick at all. Only `none` (not a candidate
 * for this shift — not in the ministry, not in the cycle) is a hard no;
 * qualification, like availability, is overridable with a reason (B-2).
 */
export function isAssignableFit({ fit }: IsAssignableFitInput): boolean {
  return fit.tier !== 'none';
}

interface ShiftRoleFitForEligibleVolunteerInput {
  volunteer: CycleBuilderEligibleVolunteerSummary;
  roleId: string;
}

/**
 * The predicate itself, over a volunteer the caller has already found. Callers
 * that walk `shift.eligibleVolunteers` (the ranking, the picker's list, its
 * recommendations) use this directly, so sharing the rule costs them a field
 * read rather than a scan of the whole eligible list per person.
 */
export function shiftRoleFitForEligibleVolunteer({
  volunteer,
  roleId,
}: ShiftRoleFitForEligibleVolunteerInput): ShiftRoleFit {
  const conflictType: SoftConflictType | undefined = volunteer.hasConflict
    ? 'double_booked'
    : volunteer.isAvailable
      ? undefined
      : 'unavailable';
  if (!volunteer.qualifiedRoleIds.includes(roleId))
    return { tier: 'unqualified', conflictType };
  if (!conflictType) return { tier: 'ready' };
  return { tier: 'override', conflictType };
}

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

interface VolunteerFitForShiftRoleInput {
  shift: CycleBuilderShiftSummary;
  roleId: string;
  volunteerId: string;
}

/** `shiftRoleFitForEligibleVolunteer` for callers holding only an id. */
export function volunteerFitForShiftRole({
  shift,
  roleId,
  volunteerId,
}: VolunteerFitForShiftRoleInput): ShiftRoleFit {
  const volunteer = shift.eligibleVolunteers.find(
    (candidate) => candidate.volunteerId === volunteerId,
  );
  if (!volunteer) return { tier: 'none' };
  return shiftRoleFitForEligibleVolunteer({ volunteer, roleId });
}

/** Payload `VolunteerCard` puts on its dnd-kit draggable. */
export interface VolunteerDragData {
  volunteerId?: string;
}

/** Payload a board cell puts on its dnd-kit droppable. */
export interface CycleDropTargetData {
  shiftId?: string;
  roleId?: string;
  assignmentId?: string;
}

interface DraggedVolunteerIdInput {
  active: Active | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Who is currently being dragged, if anyone. The id lives in the draggable's
 * `data`, not its `id` — a volunteer can be registered several times under
 * different drag ids (once per rail group), so `active.id` is not the person.
 */
export function draggedVolunteerId({
  active,
}: DraggedVolunteerIdInput): string | undefined {
  const data: unknown = active?.data.current;
  if (!isRecord(data)) return undefined;
  const volunteerId = data.volunteerId;
  return typeof volunteerId === 'string' ? volunteerId : undefined;
}

interface DropTargetDataInput {
  over: Over | null;
}

export function dropTargetData({
  over,
}: DropTargetDataInput): CycleDropTargetData | undefined {
  const data: unknown = over?.data.current;
  if (!isRecord(data)) return undefined;
  const candidate = data;
  return {
    shiftId:
      typeof candidate.shiftId === 'string' ? candidate.shiftId : undefined,
    roleId: typeof candidate.roleId === 'string' ? candidate.roleId : undefined,
    assignmentId:
      typeof candidate.assignmentId === 'string'
        ? candidate.assignmentId
        : undefined,
  };
}

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

export function pool(data: CycleBuilderData): PoolVolunteer[] {
  const result = new Map<string, PoolVolunteer>();
  const roleNameById = new Map(data.roles.map((role) => [role.id, role.name]));
  for (const event of data.events)
    for (const slot of event.slots)
      for (const shift of slot.shifts)
        for (const volunteer of shift.eligibleVolunteers) {
          result.set(volunteer.volunteerId, {
            volunteerId: volunteer.volunteerId,
            volunteerName: volunteer.volunteerName,
            status: volunteer.hasConflict
              ? 'unavailable'
              : volunteer.isAvailable
                ? 'available'
                : 'no_response',
            // Ids with no matching role are dropped rather than shown raw: a
            // uuid on the card would read as a skill name.
            qualifiedRoleNames: volunteer.qualifiedRoleIds
              .map((roleId) => roleNameById.get(roleId))
              .filter((name): name is string => name != null)
              .sort((left, right) => left.localeCompare(right)),
            lastServedAt: volunteer.lastServedAt,
          });
        }
  for (const assignment of data.assignments)
    if (!result.has(assignment.volunteerId))
      result.set(assignment.volunteerId, {
        volunteerId: assignment.volunteerId,
        volunteerName: assignment.volunteerName ?? assignment.volunteerId,
        status: 'no_response',
      });
  return [...result.values()];
}

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
  return shift.eligibleVolunteers
    .filter((volunteer) => !assignedVolunteerIds.has(volunteer.volunteerId))
    .map((volunteer) => ({
      volunteer,
      fit: shiftRoleFitForEligibleVolunteer({ volunteer, roleId }),
    }))
    .filter(({ fit }) => isAssignableFit({ fit }))
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
 * go looking for.
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
      shiftRoleFitForEligibleVolunteer({ volunteer, roleId }).tier !==
        'unqualified' && !assignedVolunteerIds.has(volunteer.volunteerId),
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
 */
export function assignableFits({
  shift,
  roleId,
  excludedVolunteerIds,
}: AssignableFitsInput): Map<string, AssignableFitTier> {
  const fits = new Map<string, AssignableFitTier>();
  for (const volunteer of shift.eligibleVolunteers) {
    if (excludedVolunteerIds?.has(volunteer.volunteerId)) continue;
    const fit = shiftRoleFitForEligibleVolunteer({ volunteer, roleId });
    // Includes `unqualified` (B-2): "Pick me" offers everyone but `none`,
    // rendering the pick as a warning rather than hiding the person.
    if (isAssignableFit({ fit }))
      fits.set(volunteer.volunteerId, fit.tier as AssignableFitTier);
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
