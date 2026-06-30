import type { Availability } from '../../domain/entities/availability';
import type { Event } from '../../domain/entities/event';
import type { TimeSlot } from '../../domain/entities/time-slot';

export type AvailabilityTaskCompletionState =
  | 'missing'
  | 'partial'
  | 'complete';

export interface AvailabilityTaskSummary {
  eventId: string;
  eventTitle: string;
  ministryId: string;
  ministryName: string;
  eventType: 'hourly' | 'day_based';
  eventStart: string;
  eventEnd: string;
  completionState: AvailabilityTaskCompletionState;
}

export interface ComputeAvailabilityTaskInput {
  event: Event;
  slots: TimeSlot[];
  ministryName: string;
  entries: Availability[];
  now: Date;
}

function createSlotKey(startTime: Date, endTime: Date): string {
  return `${startTime.toISOString()}::${endTime.toISOString()}`;
}

export function deriveAvailabilityCompletionState(input: {
  entries: Availability[];
  slots: TimeSlot[];
}): AvailabilityTaskCompletionState {
  if (input.slots.length === 0) {
    return 'missing';
  }

  const matchingKeys = new Set(
    input.entries.map((entry) => createSlotKey(entry.startTime, entry.endTime)),
  );

  const answeredSlotCount = input.slots.filter((slot) =>
    matchingKeys.has(createSlotKey(slot.startTime, slot.endTime)),
  ).length;

  if (answeredSlotCount === 0) {
    return 'missing';
  }

  return answeredSlotCount >= input.slots.length ? 'complete' : 'partial';
}

export function computeAvailabilityTask(
  input: ComputeAvailabilityTaskInput,
): AvailabilityTaskSummary | null {
  if (input.event.startDate <= input.now) {
    return null;
  }

  if (input.slots.length === 0) {
    return null;
  }

  const completionState = deriveAvailabilityCompletionState({
    entries: input.entries,
    slots: input.slots,
  });

  if (completionState === 'complete') {
    return null;
  }

  return {
    eventId: input.event.id,
    eventTitle: input.event.title,
    ministryId: input.event.ministryId,
    ministryName: input.ministryName,
    eventType: input.event.eventType,
    eventStart: input.event.startDate.toISOString(),
    eventEnd: input.event.endDate.toISOString(),
    completionState,
  };
}
