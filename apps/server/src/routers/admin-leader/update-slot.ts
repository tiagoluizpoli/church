import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { ChurchId } from '../../domain/entities/church';
import type { TimeSlotId } from '../../domain/entities/time-slot';
import type { UserId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { authorizeLeaderOrAdmin } from './authorize';

export const updateSlot = protectedProcedure
  .input(
    z.object({
      slotId: z.string(),
      startTime: z.string().datetime().optional(),
      endTime: z.string().datetime().optional(),
      label: z.string().max(255).optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const callerVol = await repositories.volunteers.findByUserIdGlobally(
      ctx.session.user.id as UserId,
    );
    if (!callerVol) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Active volunteer profile not found',
      });
    }

    const slot = await repositories.timeSlots
      .getById(callerVol.churchId, input.slotId as TimeSlotId)
      .catch(() => null);
    if (!slot) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Slot not found' });
    }

    const event = await repositories.events
      .getById(slot.churchId, slot.eventId)
      .catch(() => null);
    if (!event) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
    }

    const authCtx = await authorizeLeaderOrAdmin(
      ctx.session.user.id,
      event.ministryId,
    );
    const churchId = authCtx.churchId as ChurchId;

    if (event.status === 'published') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot edit slots of a published event',
      });
    }

    const startTime = input.startTime
      ? new Date(input.startTime)
      : slot.startTime;
    const endTime = input.endTime ? new Date(input.endTime) : slot.endTime;
    if (startTime >= endTime) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'startTime must be before endTime',
      });
    }

    if (input.startTime || input.endTime) {
      const overlapping = await repositories.timeSlots.findOverlapping(
        churchId,
        slot.eventId,
        startTime,
        endTime,
        slot.id,
      );
      if (overlapping.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Slot time overlaps an existing slot',
        });
      }
    }

    const updated = await repositories.timeSlots.update(churchId, slot.id, {
      startTime: input.startTime ? startTime : undefined,
      endTime: input.endTime ? endTime : undefined,
      label: input.label,
    });

    return {
      id: updated.id,
      startTime: updated.startTime.toISOString(),
      endTime: updated.endTime.toISOString(),
      label: updated.label ?? null,
    };
  });
