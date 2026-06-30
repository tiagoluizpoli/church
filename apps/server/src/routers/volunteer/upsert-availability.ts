import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { EventId } from '../../domain/entities/event';
import type { TimeSlot } from '../../domain/entities/time-slot';
import { repositories } from '../../infrastructure/repositories/registry';
import {
  type AvailabilityTaskCompletionState,
  deriveAvailabilityCompletionState,
} from '../../services/volunteer-dashboard/compute-availability-task';
import { protectedProcedure } from '../../trpc';
import { getCurrentVolunteer } from './shared';

const availabilityAnswerInputSchema = z.object({
  slotId: z.string(),
  response: z.enum(['available', 'unavailable']),
});

const upsertAvailabilityInputSchema = z.object({
  id: z.string().optional(),
  eventId: z.string(),
  answers: z.array(availabilityAnswerInputSchema).min(1),
  confirmOverlap: z.boolean().optional(),
});

export interface UpsertAvailabilityResult {
  success: true;
  savedEntryIds: string[];
  completionState: AvailabilityTaskCompletionState;
}

function assertEditableEventStart(eventStart: Date, now: Date): void {
  if (eventStart <= now) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Availability can no longer be edited after the event starts',
    });
  }
}

function buildSlotMap(slots: TimeSlot[]): Map<string, TimeSlot> {
  return new Map(slots.map((slot) => [slot.id, slot]));
}

export const upsertAvailability = protectedProcedure
  .input(upsertAvailabilityInputSchema)
  .mutation(async ({ input, ctx }): Promise<UpsertAvailabilityResult> => {
    const volunteer = await getCurrentVolunteer(ctx.session.user.id);
    const eventId = input.eventId as EventId;
    const event = await repositories.events
      .getById(volunteer.churchId, eventId)
      .catch(() => null);

    if (!event) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Event not found',
      });
    }

    const hasMembership = await repositories.volunteers.hasMembershipInMinistry(
      volunteer.churchId,
      volunteer.id,
      event.ministryId,
    );

    if (!hasMembership) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not belong to this ministry',
      });
    }

    assertEditableEventStart(event.startDate, new Date());

    const slots = await repositories.timeSlots.listByEvent(
      volunteer.churchId,
      eventId,
    );

    if (slots.length === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This event has no defined service slots yet',
      });
    }

    const slotById = buildSlotMap(slots);
    const uniqueAnsweredSlotIds = new Set(
      input.answers.map((answer) => answer.slotId),
    );

    if (uniqueAnsweredSlotIds.size !== slots.length) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Please answer every service slot before saving',
      });
    }

    for (const slot of slots) {
      if (!uniqueAnsweredSlotIds.has(slot.id)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Please answer every service slot before saving',
        });
      }
    }

    const savedEntries = await repositories.unitOfWork.run(async (tx) => {
      const existingEntries =
        await repositories.availability.listByVolunteerForEvent(
          volunteer.churchId,
          volunteer.id,
          eventId,
          tx,
        );

      await Promise.all(
        existingEntries.map((entry) =>
          repositories.availability.delete(volunteer.churchId, entry.id, tx),
        ),
      );

      return Promise.all(
        input.answers.map((answer) => {
          const slot = slotById.get(answer.slotId);
          if (!slot) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'One of the selected slots no longer exists',
            });
          }

          return repositories.availability.create(
            volunteer.churchId,
            {
              volunteerId: volunteer.id,
              eventId,
              type: answer.response,
              startTime: slot.startTime,
              endTime: slot.endTime,
              isAllDay: event.eventType === 'day_based',
            },
            tx,
          );
        }),
      );
    });

    return {
      success: true,
      savedEntryIds: savedEntries.map((entry) => entry.id),
      completionState: deriveAvailabilityCompletionState({
        entries: savedEntries,
        slots,
      }),
    };
  });
