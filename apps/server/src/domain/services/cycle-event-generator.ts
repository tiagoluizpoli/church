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
            startTime: buildLocalDateTime({
              date: eventDate,
              time: block.startTime,
              timeZone,
            }),
            endTime: buildLocalDateTime({
              date: eventDate,
              time: block.endTime,
              timeZone,
            }),
          }));

        if (slots.length === 0) {
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
          startDate:
            slots[0]?.startTime ??
            buildLocalDateTime({
              date: eventDate,
              time: '00:00',
              timeZone,
            }),
          endDate:
            slots[slots.length - 1]?.endTime ??
            buildLocalDateTime({
              date: eventDate,
              time: '23:59',
              timeZone,
            }),
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
