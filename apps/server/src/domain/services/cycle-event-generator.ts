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
import type { EventId, EventTemplateId, TimeBlockId } from '../branded-ids';
import type { EventTemplate } from '../entities/event-template';
import type { PlanningCycle } from '../entities/planning-cycle';

export interface ExistingGeneratedSlotFingerprint {
  eventDate: CalendarDay;
  sourceTemplateBlockId: TimeBlockId;
}

export interface ExistingGeneratedEvent {
  eventId: EventId;
  eventDate: CalendarDay;
  sourceTemplateId?: EventTemplateId;
}

export interface GenerateCycleEventsInput {
  cycle: PlanningCycle;
  templates: EventTemplate[];
  existingEvents: ExistingGeneratedEvent[];
  existingFingerprints: ExistingGeneratedSlotFingerprint[];
  timeZone: string;
}

export interface GeneratedCycleSlotPlan {
  sourceTemplateBlockId: TimeBlockId;
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
  slots: GeneratedCycleSlotPlan[];
}

export interface GeneratedCycleAppendSlotPlan {
  kind: 'append_slots';
  eventId: EventId;
  slots: GeneratedCycleSlotPlan[];
}

export type GeneratedCycleEventPlan =
  | GeneratedCycleCreateEventPlan
  | GeneratedCycleAppendSlotPlan;

interface BuildSlotBoundsInput {
  date: CalendarDay;
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  timeZone: string;
}

interface SlotBounds {
  startTime: Instant;
  endTime: Instant;
}

interface ListMatchingCycleDatesInput {
  cycle: PlanningCycle;
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
          `${fingerprint.eventDate}::${fingerprint.sourceTemplateBlockId}`,
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
            const fingerprint = `${eventDate}::${block.id as TimeBlockId}`;
            return !existingFingerprintSet.has(fingerprint);
          })
          .map((block) => ({
            sourceTemplateBlockId: block.id as TimeBlockId,
            label: block.label,
            ...buildSlotBounds({
              date: eventDate,
              startTime: block.startTime,
              endTime: block.endTime,
              timeZone,
            }),
          }));

        const [firstSlot, ...restSlots] = slots;
        const lastSlot = restSlots.at(-1) ?? firstSlot;
        if (!firstSlot || !lastSlot) {
          continue;
        }

        const existingEvent = existingEventMap.get(
          `${eventDate}::${template.id as EventTemplateId}`,
        );

        if (existingEvent) {
          plans.push({
            kind: 'append_slots',
            eventId: existingEvent.eventId,
            slots,
          });
          continue;
        }

        plans.push({
          kind: 'create_event',
          sourceTemplateId: template.id as EventTemplateId,
          title: template.name,
          start: firstSlot.startTime,
          end: lastSlot.endTime,
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
function buildSlotBounds({
  date,
  startTime,
  endTime,
  timeZone,
}: BuildSlotBoundsInput): SlotBounds {
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
