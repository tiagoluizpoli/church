import {
  fromTimeColumn,
  parseTimeOfDay,
  type TimeOfDay,
  timeOfDaySpan,
} from '@church/time';
import { fromZonedTime } from 'date-fns-tz';
import type { EventId, EventTemplateId, TimeBlockId } from '../branded-ids';
import type { EventTemplate } from '../entities/event-template';
import type { PlanningCycle } from '../entities/planning-cycle';

const ONE_DAY_IN_MS = 86_400_000;

export interface ExistingGeneratedSlotFingerprint {
  eventDate: string;
  sourceTemplateBlockId: TimeBlockId;
}

export interface ExistingGeneratedEvent {
  eventId: EventId;
  eventDate: string;
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
  startTime: Date;
  endTime: Date;
}

export interface GeneratedCycleCreateEventPlan {
  kind: 'create_event';
  sourceTemplateId: EventTemplateId;
  title: string;
  startDate: Date;
  endDate: Date;
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

interface BuildLocalDateTimeInput {
  date: string;
  time: string;
  timeZone: string;
}

interface BuildSlotBoundsInput {
  date: string;
  startTime: string;
  endTime: string;
  timeZone: string;
}

interface SlotBounds {
  startTime: Date;
  endTime: Date;
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
          startDate: firstSlot.startTime,
          endDate: lastSlot.endTime,
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
}: ListMatchingCycleDatesInput): string[] {
  const dates: string[] = [];
  let cursor = new Date(cycle.startDate);

  while (cursor < cycle.endDate) {
    if (cursor.getUTCDay() === weekday) {
      dates.push(cursor.toISOString().slice(0, 10));
    }

    cursor = new Date(cursor.getTime() + ONE_DAY_IN_MS);
  }

  return dates;
}

function buildLocalDateTime({
  date,
  time,
  timeZone,
}: BuildLocalDateTimeInput): Date {
  return fromZonedTime(`${date}T${normalizeTimeForDateTime(time)}`, timeZone);
}

function normalizeTimeForDateTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time;
}

/** A TimeBlock's time is `HH:mm` in tests or the `HH:mm:ss` a Postgres `time`
 * column returns; either way it names a TimeOfDay. */
function toTimeOfDay(time: string): TimeOfDay {
  return time.length === 5
    ? parseTimeOfDay({ value: time })
    : fromTimeColumn({ value: time });
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
    start: toTimeOfDay(startTime),
    end: toTimeOfDay(endTime),
  });
  const endDate = crossesToNextDay
    ? new Date(new Date(`${date}T00:00:00.000Z`).getTime() + ONE_DAY_IN_MS)
        .toISOString()
        .slice(0, 10)
    : date;

  return {
    startTime: buildLocalDateTime({ date, time: startTime, timeZone }),
    endTime: buildLocalDateTime({ date: endDate, time: endTime, timeZone }),
  };
}
