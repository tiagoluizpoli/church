import {
  compareInstants,
  type Instant,
  parseInstant,
  type TimeOfDay,
} from '@church/time';
import { isAxiosError } from 'axios';
import type {
  GetCycleParticipation200,
  GetCycleParticipation200EventsItem,
  GetCycleParticipation200EventsItemSlotsItem,
  GetScheduleBuilderData200RolesItem,
} from '@/infrastructure/api/churchAPI.schemas';
import {
  churchTimeOfDay,
  dayOf,
  formatInstantRangeOf,
} from '@/shared/utils/church-time';
import { toCycleDayKey } from '@/shared/utils/date';
import { isInvalidInstantRange } from '@/shared/utils/span-description';

export type TailoringFetchErrorKind = 'forbidden' | 'retryable';

export interface ClassifyTailoringFetchErrorInput {
  error: unknown;
}

/** Classifies a tailoring-route data-fetch failure into the two UI states
 * the routes render (test-master Class 4/5): a 403 is a permission-denied
 * state, everything else (network error, 5xx, unknown) is retryable. */
export function classifyTailoringFetchError({
  error,
}: ClassifyTailoringFetchErrorInput): TailoringFetchErrorKind {
  if (isAxiosError(error) && error.response?.status === 403) {
    return 'forbidden';
  }
  return 'retryable';
}

export interface SplitFormState {
  mode: 'equal' | 'manual';
  equalCount: string;
  manualSpans: ManualSpanDraft[];
}

export interface ManualSpanDraft {
  startTime: Instant;
  endTime: Instant;
  label: string;
}

/** Calendar day of a date-only value, such as a planning-cycle bound.
 *
 * Only for values that name a day rather than a moment. Slot and shift
 * timestamps are real church-local wall-clock instants (a 9am slot is stored as
 * `12:00Z` in UTC-3), so slicing their UTC prefix reports the wrong day for
 * anything served late enough to cross UTC midnight — use `dayOf` (church
 * timezone) for those. */
export function toCalendarDateString(value: string): IsoDateString {
  return toCycleDayKey(value);
}

export interface FormatTimeRangeInput {
  start: string;
  end: string;
  timeZone: string;
}

/** `dd/MM/yyyy HH:mm – HH:mm`, read on the Church Timezone's wall clock. */
export function formatTimeRange({
  start,
  end,
  timeZone,
}: FormatTimeRangeInput): string {
  return formatInstantRangeOf({ start, end, timeZone });
}

export function createInitialInclusions(
  events: GetCycleParticipation200['events'],
): Record<string, string[]> {
  return Object.fromEntries(
    events.map((eventView) => [
      eventView.participation.id,
      eventView.slots
        .filter((slotView) => slotView.included)
        .map((slotView) => slotView.slot.id),
    ]),
  );
}

export function createInitialSplitForms(
  events: GetCycleParticipation200['events'],
): Record<string, SplitFormState> {
  const entries: Record<string, SplitFormState> = {};

  for (const eventView of events) {
    for (const slotView of eventView.slots) {
      entries[slotView.slot.id] = {
        mode: 'equal',
        equalCount: String(Math.max(1, slotView.shifts.length)),
        manualSpans:
          slotView.shifts.length > 0
            ? slotView.shifts.map((shift) => ({
                startTime: parseInstant({ value: shift.startTime }),
                endTime: parseInstant({ value: shift.endTime }),
                label: shift.label ?? '',
              }))
            : [
                {
                  startTime: parseInstant({ value: slotView.slot.startTime }),
                  endTime: parseInstant({ value: slotView.slot.endTime }),
                  label: slotView.slot.label ?? '',
                },
              ],
      };
    }
  }

  return entries;
}

export function createInitialHeadcountDrafts(
  events: GetCycleParticipation200['events'],
): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const eventView of events) {
    for (const slotView of eventView.slots) {
      for (const requirement of slotView.requirements) {
        entries[toHeadcountKey(requirement.shiftId, requirement.roleId)] =
          String(requirement.requiredCount);
      }
    }
  }

  return entries;
}

export function toHeadcountKey(shiftId: string, roleId: string): string {
  return `${shiftId}:${roleId}`;
}

export function getSlotRoleOptions({
  roles,
  slotView,
}: {
  roles: GetScheduleBuilderData200RolesItem[];
  slotView: GetCycleParticipation200EventsItemSlotsItem;
}): GetScheduleBuilderData200RolesItem[] {
  if (roles.length > 0) return roles;

  return slotView.requirements.map((requirement) => ({
    id: requirement.roleId,
    name: requirement.roleId,
  }));
}

export function validateManualSpans({
  slotView,
  spans,
}: {
  slotView: GetCycleParticipation200EventsItemSlotsItem;
  spans: ManualSpanDraft[];
}): string | null {
  const slotStart = parseInstant({ value: slotView.slot.startTime });
  const slotEnd = parseInstant({ value: slotView.slot.endTime });

  if (
    spans.some((span) =>
      isInvalidInstantRange({ start: span.startTime, end: span.endTime }),
    )
  ) {
    return 'Each manual shift must end after it starts.';
  }

  if (
    spans.some(
      (span) =>
        compareInstants({ left: span.startTime, right: slotStart }) === -1 ||
        compareInstants({ left: span.endTime, right: slotEnd }) === 1,
    )
  ) {
    return 'Manual shifts must stay within the parent slot bounds.';
  }

  const ordered = [...spans].sort((left, right) =>
    compareInstants({ left: left.startTime, right: right.startTime }),
  );

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (
      previous &&
      current &&
      compareInstants({ left: previous.endTime, right: current.startTime }) ===
        1
    ) {
      return 'Manual shifts cannot overlap.';
    }
  }

  return null;
}

export function countIncludedSlots(
  events: GetCycleParticipation200EventsItem[],
): number {
  return events.reduce(
    (total, eventView) =>
      total + eventView.slots.filter((slotView) => slotView.included).length,
    0,
  );
}

const PARTICIPATION_STATE_LABELS: Record<
  GetCycleParticipation200EventsItem['participation']['state'],
  string
> = {
  tailoring: 'Tailoring',
  // biome-ignore lint/style/useNamingConvention: matches the API's MinistryParticipation.state enum value verbatim
  availability_fired: 'Availability requested',
  rostering: 'Rostering',
  published: 'Published',
};

/** Humanizes a raw `MinistryParticipation.state` enum for display. A
 * lifecycle label, not a staffing signal — never uses the green/amber/red
 * status vocabulary (DESIGN.md reserves that strictly for staffing %/
 * confirmation state). */
export function participationStateLabel({
  state,
}: {
  state: GetCycleParticipation200EventsItem['participation']['state'];
}): string {
  return PARTICIPATION_STATE_LABELS[state];
}

export function countShifts(
  events: GetCycleParticipation200EventsItem[],
): number {
  return events.reduce(
    (total, eventView) =>
      total +
      eventView.slots.reduce(
        (slotTotal, slotView) => slotTotal + slotView.shifts.length,
        0,
      ),
    0,
  );
}

export function toMinistryCycleKey({
  ministryId,
  cycleId,
}: {
  ministryId: string;
  cycleId: string;
}): string {
  return `${ministryId}:${cycleId}`;
}

export interface MinistryTailoringSummaryRow {
  ministryId: string;
  ministryName: string;
  eventCount: number;
  slotCount: number;
}

/** Aggregates per-ministry event/slot counts for the ministry-list landing
 * page. Pure function over already-fetched data — the fetch orchestration
 * (listMinistries + listPlanningCycles({state:'locked'}) + per-ministry
 * listEvents + per-(ministry, locked cycle) getCycleParticipation) lives in
 * the route, per research.md R10. "Cycle set" = union of every cycle
 * currently in `locked` state, not a single "most recent" cycle. */
export function buildMinistryTailoringSummary({
  ministries,
  lockedCycleIds,
  eventsByMinistryId,
  slotCountByMinistryAndCycle,
}: {
  ministries: { id: string; name: string }[];
  lockedCycleIds: string[];
  eventsByMinistryId: Record<string, { planningCycleId: string }[] | undefined>;
  slotCountByMinistryAndCycle: Record<string, number>;
}): MinistryTailoringSummaryRow[] {
  const lockedCycleIdSet = new Set(lockedCycleIds);

  return ministries.map((ministry) => {
    const relevantEvents = (eventsByMinistryId[ministry.id] ?? []).filter(
      (event) => lockedCycleIdSet.has(event.planningCycleId),
    );
    const relevantCycleIds = new Set(
      relevantEvents.map((event) => event.planningCycleId),
    );

    const slotCount = [...relevantCycleIds].reduce(
      (total, cycleId) =>
        total +
        (slotCountByMinistryAndCycle[
          toMinistryCycleKey({ ministryId: ministry.id, cycleId })
        ] ?? 0),
      0,
    );

    return {
      ministryId: ministry.id,
      ministryName: ministry.name,
      eventCount: relevantEvents.length,
      slotCount,
    };
  });
}

export type IsoDateString = string;

/** Derives the set of calendar days with at least one visible tailoring slot.
 * The strip dot is a "there is something to work on this day" marker, so it
 * should come from actual slot timestamps, not a parent event's full span. */
export interface BuildSlotDayMarkersInput {
  events: GetCycleParticipation200EventsItem[];
  timeZone: string;
}

export function buildSlotDayMarkers({
  events,
  timeZone,
}: BuildSlotDayMarkersInput): Set<IsoDateString> {
  const markers = new Set<IsoDateString>();

  for (const eventView of events) {
    for (const slotView of eventView.slots) {
      markers.add(dayOf({ value: slotView.slot.startTime, timeZone }));
    }
  }

  return markers;
}

/** Client-side, already-fetched-data-only slot filters (FR-010) — never
 * issue network requests. Both drop an event entirely once it has zero
 * matching slots, so the day-grouped slot list only shows groups with
 * visible content. */
export function filterSlotsByName({
  events,
  query,
}: {
  events: GetCycleParticipation200EventsItem[];
  query: string;
}): GetCycleParticipation200EventsItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return events;

  return events
    .map((eventView) => ({
      ...eventView,
      slots: eventView.slots.filter((slotView) => {
        const label = (slotView.slot.label ?? '').toLowerCase();
        const eventTitle = eventView.event.title.toLowerCase();
        return label.includes(needle) || eventTitle.includes(needle);
      }),
    }))
    .filter((eventView) => eventView.slots.length > 0);
}

export type TimeWindowMode = 'starts' | 'ends' | 'within';

/** A single [start, end] local-time-of-day window (`HH:mm` strings),
 * applied per `mode`: `'starts'` keeps slots whose start time falls in the
 * window, `'ends'` keeps slots whose end time falls in the window, and
 * `'within'` keeps slots whose entire span (start AND end) falls inside the
 * window. Either bound may be omitted to leave that side open-ended. */
export interface TimeWindowFilter {
  mode: TimeWindowMode;
  start?: TimeOfDay;
  end?: TimeOfDay;
}

function toMinutesSinceMidnight(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

interface ChurchTimeOfDayInMinutesInput {
  isoValue: string;
  timeZone: string;
}

function churchTimeOfDayInMinutes({
  isoValue,
  timeZone,
}: ChurchTimeOfDayInMinutesInput): number {
  return toMinutesSinceMidnight(churchTimeOfDay({ value: isoValue, timeZone }));
}

export function isTimeWindowFilterEmpty(filter: TimeWindowFilter): boolean {
  return !filter.start && !filter.end;
}

function isWithinWindow({
  minutes,
  filter,
}: {
  minutes: number;
  filter: TimeWindowFilter;
}): boolean {
  if (filter.start && minutes < toMinutesSinceMidnight(filter.start)) {
    return false;
  }
  if (filter.end && minutes > toMinutesSinceMidnight(filter.end)) {
    return false;
  }
  return true;
}

export interface FilterSlotsByTimeOfDayInput {
  events: GetCycleParticipation200EventsItem[];
  filter: TimeWindowFilter;
  timeZone: string;
}

export function filterSlotsByTimeOfDay({
  events,
  filter,
  timeZone,
}: FilterSlotsByTimeOfDayInput): GetCycleParticipation200EventsItem[] {
  if (isTimeWindowFilterEmpty(filter)) return events;

  return events
    .map((eventView) => ({
      ...eventView,
      slots: eventView.slots.filter((slotView) => {
        const startMinutes = churchTimeOfDayInMinutes({
          isoValue: slotView.slot.startTime,
          timeZone,
        });
        const endMinutes = churchTimeOfDayInMinutes({
          isoValue: slotView.slot.endTime,
          timeZone,
        });

        if (filter.mode === 'starts') {
          return isWithinWindow({ minutes: startMinutes, filter });
        }
        if (filter.mode === 'ends') {
          return isWithinWindow({ minutes: endMinutes, filter });
        }
        return (
          isWithinWindow({ minutes: startMinutes, filter }) &&
          isWithinWindow({ minutes: endMinutes, filter })
        );
      }),
    }))
    .filter((eventView) => eventView.slots.length > 0);
}
