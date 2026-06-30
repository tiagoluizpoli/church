import { z } from 'zod';
import type { EventId } from '../../domain/entities/event';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { getCurrentVolunteer } from './shared';

function createAvailabilitySlotKey(startTime: Date, endTime: Date): string {
  return `${startTime.toISOString()}::${endTime.toISOString()}`;
}

export const getMyAvailability = protectedProcedure
  .input(
    z.object({
      eventId: z.string().optional(),
    }),
  )
  .query(async ({ input, ctx }) => {
    const volunteer = await getCurrentVolunteer(ctx.session.user.id);

    if (!input.eventId) {
      return { slots: [] };
    }

    const event = await repositories.events
      .getWithSlots(volunteer.churchId, input.eventId as EventId)
      .catch(() => null);

    if (!event) {
      return { slots: [] };
    }

    const entries = await repositories.availability.listByVolunteerForEvent(
      volunteer.churchId,
      volunteer.id,
      input.eventId as EventId,
    );

    const entryBySlotKey = new Map(
      entries.map((entry) => [
        createAvailabilitySlotKey(entry.startTime, entry.endTime),
        entry,
      ]),
    );

    return {
      slots: event.slots
        .sort(
          (left, right) => left.startTime.getTime() - right.startTime.getTime(),
        )
        .map((slot) => {
          const entry = entryBySlotKey.get(
            createAvailabilitySlotKey(slot.startTime, slot.endTime),
          );

          return {
            slotId: slot.id,
            label: slot.label ?? 'Service slot',
            startTime: slot.startTime.toISOString(),
            endTime: slot.endTime.toISOString(),
            response: entry?.type,
          };
        }),
    };
  });
