import {
  addCalendarDays,
  type CalendarDay,
  compareCalendarDays,
  compareInstants,
  type Instant,
  type TimeOfDay,
  timeOfDaySpan,
  toInstant,
  weekdayIndex,
} from '@church/time';
import type {
  EventId,
  EventTemplateId,
  TemplateTimeBlockId,
} from '../branded-ids';
import type { Cycle } from '../entities/cycle';
import type { EventTemplate } from '../entities/event-template';

export interface ExistingGeneratedEventTimeBlockFingerprint {
  eventDate: CalendarDay;
  sourceTemplateTimeBlockId: TemplateTimeBlockId;
}

export interface ExistingGeneratedEvent {
  eventId: EventId;
  eventDate: CalendarDay;
  sourceTemplateId?: EventTemplateId;
  /** A legacy cancelled copy still occupies its slot but is never revived. */
  cancelled?: boolean;
}

export interface GenerateCycleEventsInput {
  cycle: Cycle;
  templates: EventTemplate[];
  existingEvents: ExistingGeneratedEvent[];
  existingFingerprints: ExistingGeneratedEventTimeBlockFingerprint[];
  timeZone: string;
}

export interface GeneratedCycleEventTimeBlockPlan {
  sourceTemplateTimeBlockId: TemplateTimeBlockId;
  label: string;
  startTime: Instant;
  endTime: Instant;
}

export interface GeneratedCycleCreateEventPlan {
  kind: 'create_event';
  sourceTemplateId: EventTemplateId;
  title: string;
  start: Instant;
  end: Instant;
  eventTimeBlocks: GeneratedCycleEventTimeBlockPlan[];
}

export interface GeneratedCycleAppendEventTimeBlockPlan {
  kind: 'append_event_time_blocks';
  eventId: EventId;
  eventTimeBlocks: GeneratedCycleEventTimeBlockPlan[];
}

export type GeneratedCycleEventPlan =
  | GeneratedCycleCreateEventPlan
  | GeneratedCycleAppendEventTimeBlockPlan;

interface BuildEventTimeBlockBoundsInput {
  date: CalendarDay;
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  timeZone: string;
}

interface EventTimeBlockBounds {
  startTime: Instant;
  endTime: Instant;
}

interface ListMatchingCycleDatesInput {
  cycle: Cycle;
  weekday: number;
}

export class CycleEventGenerator {
  generate({
    cycle,
    templates,
    existingEvents,
    existingFingerprints,
    timeZone,
  }: GenerateCycleEventsInput): GeneratedCycleEventPlan[] {
    const existingFingerprintSet = new Set(
      existingFingerprints.map(
        (fingerprint) =>
          `${fingerprint.eventDate}::${fingerprint.sourceTemplateTimeBlockId}`,
      ),
    );
    const existingEventMap = new Map(
      existingEvents
        .filter((event) => event.sourceTemplateId)
        .map((event) => [
          `${event.eventDate}::${event.sourceTemplateId}`,
          event,
        ]),
    );
    const plans: GeneratedCycleEventPlan[] = [];

    for (const template of templates) {
      const matchingDates = listMatchingCycleDates({
        cycle,
        weekday: template.weekday,
      });

      for (const eventDate of matchingDates) {
        const eventTimeBlocks = template.blocks
          .filter((block) => {
            const fingerprint = `${eventDate}::${block.id as TemplateTimeBlockId}`;
            return !existingFingerprintSet.has(fingerprint);
          })
          .map((block) => ({
            sourceTemplateTimeBlockId: block.id as TemplateTimeBlockId,
            label: block.label,
            ...buildEventTimeBlockBounds({
              date: eventDate,
              startTime: block.startTime,
              endTime: block.endTime,
              timeZone,
            }),
          }));

        if (eventTimeBlocks.length === 0) {
          continue;
        }

        const existingEvent = existingEventMap.get(
          `${eventDate}::${template.id as EventTemplateId}`,
        );

        if (existingEvent?.cancelled) {
          continue;
        }

        if (existingEvent) {
          plans.push({
            kind: 'append_event_time_blocks',
            eventId: existingEvent.eventId,
            eventTimeBlocks,
          });
          continue;
        }

        plans.push({
          kind: 'create_event',
          sourceTemplateId: template.id as EventTemplateId,
          title: template.name,
          ...eventTimeBlockEnvelope({ eventTimeBlocks }),
          eventTimeBlocks,
        });
      }
    }

    return plans;
  }
}

interface EventTimeBlockEnvelopeInput {
  eventTimeBlocks: EventTimeBlockBounds[];
}

/** Earliest start and latest end: an overnight block may end after a later one. */
export function eventTimeBlockEnvelope({
  eventTimeBlocks,
}: EventTimeBlockEnvelopeInput): { start: Instant; end: Instant } {
  const [first, ...rest] = eventTimeBlocks;
  if (!first) {
    throw new Error('An envelope needs at least one time block.');
  }
  let { startTime: start, endTime: end } = first;
  for (const block of rest) {
    if (compareInstants({ left: block.startTime, right: start }) < 0) {
      start = block.startTime;
    }
    if (compareInstants({ left: block.endTime, right: end }) > 0) {
      end = block.endTime;
    }
  }
  return { start, end };
}

function listMatchingCycleDates({
  cycle,
  weekday,
}: ListMatchingCycleDatesInput): CalendarDay[] {
  const dates: CalendarDay[] = [];
  let cursor = cycle.startDate;

  while (compareCalendarDays({ left: cursor, right: cycle.endDate }) <= 0) {
    if (weekdayIndex({ day: cursor }) === weekday) {
      dates.push(cursor);
    }

    cursor = addCalendarDays({ day: cursor, days: 1 });
  }

  return dates;
}

/**
 * A block's end earlier than its start crosses midnight (ADR-0003), so its
 * end resolves against the following day.
 */
function buildEventTimeBlockBounds({
  date,
  startTime,
  endTime,
  timeZone,
}: BuildEventTimeBlockBoundsInput): EventTimeBlockBounds {
  const { crossesToNextDay } = timeOfDaySpan({
    start: startTime,
    end: endTime,
  });
  const endDate = crossesToNextDay
    ? addCalendarDays({ day: date, days: 1 })
    : date;

  return {
    startTime: toInstant({ day: date, time: startTime, timeZone }),
    endTime: toInstant({ day: endDate, time: endTime, timeZone }),
  };
}
