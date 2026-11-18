import type { TimeOfDay } from '@church/time';
import { isAxiosError } from 'axios';
import type { GetCycleParticipation200EventsItem } from '@/infrastructure/api/churchAPI.schemas';
import { churchTimeOfDay, dayOf } from '@/shared/utils/church-time';
import { toCycleDayKey } from '@/shared/utils/date';

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

export interface ToScheduleKeyInput {
  ministryId: string;
  cycleId: string;
}

export function toScheduleKey({
  ministryId,
  cycleId,
}: ToScheduleKeyInput): string {
  return `${ministryId}:${cycleId}`;
}

export interface MinistryPrepareSummaryRow {
  ministryId: string;
  ministryName: string;
  eventCount: number;
  eventTimeBlockCount: number;
}

export interface BuildMinistryPrepareSummaryInput {
  ministries: { id: string; name: string }[];
  sentCycleIds: string[];
  eventsByMinistryId: Record<string, { cycleId: string }[] | undefined>;
  eventTimeBlockCountByMinistryAndCycle: Record<string, number>;
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
}: BuildMinistryPrepareSummaryInput): MinistryPrepareSummaryRow[] {
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

export interface FilterEventTimeBlocksByNameInput {
  events: GetCycleParticipation200EventsItem[];
  query: string;
}

/** Client-side, already-fetched-data-only time block filters (FR-010) — never
 * issue network requests. Both drop an event entirely once it has zero
 * matching time blocks, so the day-grouped time block list only shows groups with
 * visible content. */
export function filterEventTimeBlocksByName({
  events,
  query,
}: FilterEventTimeBlocksByNameInput): GetCycleParticipation200EventsItem[] {
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

interface IsWithinWindowInput {
  minutes: number;
  filter: TimeWindowFilter;
}

function isWithinWindow({ minutes, filter }: IsWithinWindowInput): boolean {
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
