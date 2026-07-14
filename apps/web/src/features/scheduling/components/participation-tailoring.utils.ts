import { isAxiosError } from 'axios';
import type {
  GetCycleParticipation200,
  GetCycleParticipation200EventsItem,
  GetCycleParticipation200EventsItemSlotsItem,
  GetScheduleBuilderData200RolesItem,
} from '@/infrastructure/api/churchAPI.schemas';

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
  startTime: string;
  endTime: string;
  label: string;
}

/** Parses the `yyyy-MM-dd` portion of a date-only or full ISO date-time
 * string as a local calendar date. `new Date(dateOnlyString)` parses at UTC
 * midnight, which shifts the displayed day back one in timezones behind UTC
 * — this treats the value as the calendar day it represents instead. */
export function parseCalendarDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** Extracts API timestamp's calendar-date portion without browser-local
 * conversion. Cycle bounds and server-provided slot timestamps share this
 * calendar representation; converting with `Date#getDate()` can move a UTC
 * midnight slot into its previous local day. */
export function toCalendarDateString(value: string): IsoDateString {
  return value.slice(0, 10);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parseCalendarDate(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatTimeRange({
  start,
  end,
}: {
  start: string;
  end: string;
}): string {
  return `${formatDateTime(start)} - ${new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(end))}`;
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
                startTime: toLocalDateTimeValue(shift.startTime),
                endTime: toLocalDateTimeValue(shift.endTime),
                label: shift.label ?? '',
              }))
            : [
                {
                  startTime: toLocalDateTimeValue(slotView.slot.startTime),
                  endTime: toLocalDateTimeValue(slotView.slot.endTime),
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

export function toLocalDateTimeValue(isoValue: string): string {
  const date = new Date(isoValue);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function toIsoString(localValue: string): string {
  return new Date(localValue).toISOString();
}

export function validateManualSpans({
  slotView,
  spans,
}: {
  slotView: GetCycleParticipation200EventsItemSlotsItem;
  spans: ManualSpanDraft[];
}): string | null {
  const slotStart = new Date(slotView.slot.startTime);
  const slotEnd = new Date(slotView.slot.endTime);
  const parsed = spans.map((span) => ({
    ...span,
    start: new Date(span.startTime),
    end: new Date(span.endTime),
  }));

  if (
    parsed.some(
      (span) =>
        Number.isNaN(span.start.getTime()) || Number.isNaN(span.end.getTime()),
    )
  ) {
    return 'Fill every manual shift time before saving.';
  }

  if (parsed.some((span) => span.start >= span.end)) {
    return 'Each manual shift must end after it starts.';
  }

  if (parsed.some((span) => span.start < slotStart || span.end > slotEnd)) {
    return 'Manual shifts must stay within the parent slot bounds.';
  }

  const ordered = [...parsed].sort(
    (left, right) => left.start.getTime() - right.start.getTime(),
  );

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous && current && previous.end > current.start) {
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

export function toIsoDateString(date: Date): IsoDateString {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Derives the set of calendar days with at least one visible tailoring slot.
 * The strip dot is a "there is something to work on this day" marker, so it
 * should come from actual slot timestamps, not a parent event's full span. */
export function buildSlotDayMarkers({
  events,
}: {
  events: GetCycleParticipation200EventsItem[];
}): Set<IsoDateString> {
  const markers = new Set<IsoDateString>();

  for (const eventView of events) {
    for (const slotView of eventView.slots) {
      markers.add(toCalendarDateString(slotView.slot.startTime));
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
  start?: string;
  end?: string;
}

function toMinutesSinceMidnight(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function localTimeOfDayInMinutes(isoValue: string): number {
  const date = new Date(isoValue);
  return date.getHours() * 60 + date.getMinutes();
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

export function filterSlotsByTimeOfDay({
  events,
  filter,
}: {
  events: GetCycleParticipation200EventsItem[];
  filter: TimeWindowFilter;
}): GetCycleParticipation200EventsItem[] {
  if (isTimeWindowFilterEmpty(filter)) return events;

  return events
    .map((eventView) => ({
      ...eventView,
      slots: eventView.slots.filter((slotView) => {
        const startMinutes = localTimeOfDayInMinutes(slotView.slot.startTime);
        const endMinutes = localTimeOfDayInMinutes(slotView.slot.endTime);

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
