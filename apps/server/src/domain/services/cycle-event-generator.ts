import {
  addCalendarDays,
  type CalendarDay,
  compareCalendarDays,
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
  slots: GeneratedCycleEventTimeBlockPlan[];
}

export interface GeneratedCycleAppendEventTimeBlockPlan {
  kind: 'append_event_time_blocks';
  eventId: EventId;
  slots: GeneratedCycleEventTimeBlockPlan[];
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
        const slots = template.blocks
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

        const [firstEventTimeBlock, ...restEventTimeBlocks] = slots;
        const lastEventTimeBlock =
          restEventTimeBlocks.at(-1) ?? firstEventTimeBlock;
        if (!firstEventTimeBlock || !lastEventTimeBlock) {
          continue;
        }

        const existingEvent = existingEventMap.get(
          `${eventDate}::${template.id as EventTemplateId}`,
        );

        if (existingEvent) {
          plans.push({
            kind: 'append_event_time_blocks',
            eventId: existingEvent.eventId,
            slots,
          });
          continue;
        }

        plans.push({
          kind: 'create_event',
          sourceTemplateId: template.id as EventTemplateId,
          title: template.name,
          start: firstEventTimeBlock.startTime,
          end: lastEventTimeBlock.endTime,
          slots,
        });
      }
    }

    return plans;
  }
}

function listMatchingCycleDates({
  cycle,
  weekday,
}: ListMatchingCycleDatesInput): CalendarDay[] {
  const dates: CalendarDay[] = [];
  let cursor = cycle.startDate;

  while (compareCalendarDays({ left: cursor, right: cycle.endDate }) < 0) {
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
