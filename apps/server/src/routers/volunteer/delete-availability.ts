import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { AvailabilityId } from '../../domain/entities/availability';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { getCurrentVolunteer } from './shared';

const deleteAvailabilityInputSchema = z.object({
  id: z.string(),
});

export const deleteAvailability = protectedProcedure
  .input(deleteAvailabilityInputSchema)
  .mutation(async ({ input, ctx }) => {
    const volunteer = await getCurrentVolunteer(ctx.session.user.id);
    const entry = await repositories.availability.getById(
      volunteer.churchId,
      input.id as AvailabilityId,
    );

    if (entry.volunteerId !== volunteer.id) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You cannot delete another volunteer’s availability',
      });
    }

    if (!entry.eventId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Only event-scoped availability can be deleted here',
      });
    }

    const event = await repositories.events.getById(
      volunteer.churchId,
      entry.eventId,
    );

    if (event.startDate <= new Date()) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Availability can no longer be edited after the event starts',
      });
    }

    await repositories.availability.delete(
      volunteer.churchId,
      input.id as AvailabilityId,
    );

    return { success: true as const };
  });
