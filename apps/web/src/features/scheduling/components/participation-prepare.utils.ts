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
  GetCycleParticipation200EventsItemEventTimeBlocksItem,
  GetScheduleBuilderData200RolesItem,
} from '@/infrastructure/api/churchAPI.schemas';
import {
  churchTimeOfDay,
  dayOf,
  formatInstantRangeOf,
} from '@/shared/utils/church-time';
import { toCycleDayKey } from '@/shared/utils/date';
import { isInvalidInstantRange } from '@/shared/utils/span-description';

export type PrepareFetchErrorKind = 'forbidden' | 'retryable';

export interface ClassifyPrepareFetchErrorInput {
  error: unknown;
}

/** Classifies a prepare-route data-fetch failure into the two UI states
 * the routes render (test-master Class 4/5): a 403 is a permission-denied
 * state, everything else (network error, 5xx, unknown) is retryable. */
export function classifyPrepareFetchError({
  error,
}: ClassifyPrepareFetchErrorInput): PrepareFetchErrorKind {
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

/** Calendar day of a date-only value, such as a cycle bound.
 *
 * Only for values that name a day rather than a moment. Time block and shift
 * timestamps are real church-local wall-clock instants (a 9am time block is stored as
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
      eventView.eventTimeBlocks
        .filter((eventTimeBlockView) => eventTimeBlockView.included)
        .map((eventTimeBlockView) => eventTimeBlockView.eventTimeBlock.id),
    ]),
  );
}

export function createInitialSplitForms(
  events: GetCycleParticipation200['events'],
): Record<string, SplitFormState> {
  const entries: Record<string, SplitFormState> = {};

  for (const eventView of events) {
    for (const eventTimeBlockView of eventView.eventTimeBlocks) {
      entries[eventTimeBlockView.eventTimeBlock.id] = {
        mode: 'equal',
        equalCount: String(Math.max(1, eventTimeBlockView.shifts.length)),
        manualSpans:
          eventTimeBlockView.shifts.length > 0
            ? eventTimeBlockView.shifts.map((shift) => ({
                startTime: parseInstant({ value: shift.startTime }),
                endTime: parseInstant({ value: shift.endTime }),
                label: shift.label ?? '',
              }))
            : [
                {
                  startTime: parseInstant({
                    value: eventTimeBlockView.eventTimeBlock.startTime,
                  }),
                  endTime: parseInstant({
                    value: eventTimeBlockView.eventTimeBlock.endTime,
                  }),
                  label: eventTimeBlockView.eventTimeBlock.label ?? '',
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
    for (const eventTimeBlockView of eventView.eventTimeBlocks) {
      for (const requirement of eventTimeBlockView.requirements) {
        entries[toHeadcountKey(requirement.shiftId, requirement.roleId)] =
          String(requirement.peopleNeeded);
      }
    }
  }

  return entries;
}

export function toHeadcountKey(shiftId: string, roleId: string): string {
  return `${shiftId}:${roleId}`;
}

export function getEventTimeBlockRoleOptions({
  roles,
  eventTimeBlockView,
}: {
  roles: GetScheduleBuilderData200RolesItem[];
  eventTimeBlockView: GetCycleParticipation200EventsItemEventTimeBlocksItem;
}): GetScheduleBuilderData200RolesItem[] {
  if (roles.length > 0) return roles;

  return eventTimeBlockView.requirements.map((requirement) => ({
    id: requirement.roleId,
    name: requirement.roleId,
  }));
}

export function validateManualSpans({
  eventTimeBlockView,
  spans,
}: {
  eventTimeBlockView: GetCycleParticipation200EventsItemEventTimeBlocksItem;
  spans: ManualSpanDraft[];
}): string | null {
  const eventTimeBlockStart = parseInstant({
    value: eventTimeBlockView.eventTimeBlock.startTime,
  });
  const eventTimeBlockEnd = parseInstant({
    value: eventTimeBlockView.eventTimeBlock.endTime,
  });

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
        compareInstants({
          left: span.startTime,
          right: eventTimeBlockStart,
        }) === -1 ||
        compareInstants({ left: span.endTime, right: eventTimeBlockEnd }) === 1,
    )
  ) {
    return 'Manual shifts must stay within the parent time block bounds.';
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

export function countIncludedEventTimeBlocks(
  events: GetCycleParticipation200EventsItem[],
): number {
  return events.reduce(
    (total, eventView) =>
      total +
      eventView.eventTimeBlocks.filter(
        (eventTimeBlockView) => eventTimeBlockView.included,
      ).length,
    0,
  );
}

const PARTICIPATION_STATE_LABELS: Record<
  GetCycleParticipation200EventsItem['participation']['state'],
  string
> = {
  preparing: 'Preparing',
  // biome-ignore lint/style/useNamingConvention: matches the API's MinistryParticipation.state enum value verbatim
  availability_requested: 'Availability requested',
  assigning: 'Assigning',
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
      eventView.eventTimeBlocks.reduce(
        (eventTimeBlockTotal, eventTimeBlockView) =>
          eventTimeBlockTotal + eventTimeBlockView.shifts.length,
        0,
      ),
    0,
  );
}

export function toScheduleKey({
  ministryId,
  cycleId,
}: {
  ministryId: string;
  cycleId: string;
}): string {
  return `${ministryId}:${cycleId}`;
}

export interface MinistryPrepareSummaryRow {
  ministryId: string;
  ministryName: string;
  eventCount: number;
  eventTimeBlockCount: number;
}

/** Aggregates per-ministry event/time block counts for the ministry-list landing
 * page. Pure function over already-fetched data — the fetch orchestration
 * (listMinistries + listCycles({state:'sent'}) + per-ministry
 * listEvents + per-(ministry, sent cycle) getCycleParticipation) lives in
 * the route, per research.md R10. "Cycle set" = union of every cycle
 * currently in `sent` state, not a single "most recent" cycle. */
export function buildMinistryPrepareSummary({
  ministries,
  sentCycleIds,
  eventsByMinistryId,
  eventTimeBlockCountByMinistryAndCycle,
}: {
  ministries: { id: string; name: string }[];
  sentCycleIds: string[];
  eventsByMinistryId: Record<string, { cycleId: string }[] | undefined>;
  eventTimeBlockCountByMinistryAndCycle: Record<string, number>;
}): MinistryPrepareSummaryRow[] {
  const sentCycleIdSet = new Set(sentCycleIds);

  return ministries.map((ministry) => {
    const relevantEvents = (eventsByMinistryId[ministry.id] ?? []).filter(
      (event) => sentCycleIdSet.has(event.cycleId),
    );
    const relevantCycleIds = new Set(
      relevantEvents.map((event) => event.cycleId),
    );

    const eventTimeBlockCount = [...relevantCycleIds].reduce(
      (total, cycleId) =>
        total +
        (eventTimeBlockCountByMinistryAndCycle[
          toScheduleKey({ ministryId: ministry.id, cycleId })
        ] ?? 0),
      0,
    );

    return {
      ministryId: ministry.id,
      ministryName: ministry.name,
      eventCount: relevantEvents.length,
      eventTimeBlockCount,
    };
  });
}

export type IsoDateString = string;

/** Derives the set of calendar days with at least one visible prepare time block.
 * The strip dot is a "there is something to work on this day" marker, so it
 * should come from actual time block timestamps, not a parent event's full span. */
export interface BuildEventTimeBlockDayMarkersInput {
  events: GetCycleParticipation200EventsItem[];
  timeZone: string;
}

export function buildEventTimeBlockDayMarkers({
  events,
  timeZone,
}: BuildEventTimeBlockDayMarkersInput): Set<IsoDateString> {
  const markers = new Set<IsoDateString>();

  for (const eventView of events) {
    for (const eventTimeBlockView of eventView.eventTimeBlocks) {
      markers.add(
        dayOf({ value: eventTimeBlockView.eventTimeBlock.startTime, timeZone }),
      );
    }
  }

  return markers;
}

/** Client-side, already-fetched-data-only time block filters (FR-010) — never
 * issue network requests. Both drop an event entirely once it has zero
 * matching time blocks, so the day-grouped time block list only shows groups with
 * visible content. */
export function filterEventTimeBlocksByName({
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
      eventTimeBlocks: eventView.eventTimeBlocks.filter(
        (eventTimeBlockView) => {
          const label = (
            eventTimeBlockView.eventTimeBlock.label ?? ''
          ).toLowerCase();
          const eventTitle = eventView.event.title.toLowerCase();
          return label.includes(needle) || eventTitle.includes(needle);
        },
      ),
    }))
    .filter((eventView) => eventView.eventTimeBlocks.length > 0);
}

export type TimeWindowMode = 'starts' | 'ends' | 'within';

/** A single [start, end] local-time-of-day window (`HH:mm` strings),
 * applied per `mode`: `'starts'` keeps time blocks whose start time falls in the
 * window, `'ends'` keeps time blocks whose end time falls in the window, and
 * `'within'` keeps time blocks whose entire span (start AND end) falls inside the
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

export interface FilterEventTimeBlocksByTimeOfDayInput {
  events: GetCycleParticipation200EventsItem[];
  filter: TimeWindowFilter;
  timeZone: string;
}

export function filterEventTimeBlocksByTimeOfDay({
  events,
  filter,
  timeZone,
}: FilterEventTimeBlocksByTimeOfDayInput): GetCycleParticipation200EventsItem[] {
  if (isTimeWindowFilterEmpty(filter)) return events;

  return events
    .map((eventView) => ({
      ...eventView,
      eventTimeBlocks: eventView.eventTimeBlocks.filter(
        (eventTimeBlockView) => {
          const startMinutes = churchTimeOfDayInMinutes({
            isoValue: eventTimeBlockView.eventTimeBlock.startTime,
            timeZone,
          });
          const endMinutes = churchTimeOfDayInMinutes({
            isoValue: eventTimeBlockView.eventTimeBlock.endTime,
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
        },
      ),
    }))
    .filter((eventView) => eventView.eventTimeBlocks.length > 0);
}
