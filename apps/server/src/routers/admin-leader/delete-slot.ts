import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { ChurchId } from '../../domain/entities/church';
import type { TimeSlotId } from '../../domain/entities/time-slot';
import type { UserId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { authorizeLeaderOrAdmin } from './authorize';

export const deleteSlot = protectedProcedure
  .input(z.object({ slotId: z.string(), force: z.boolean().optional() }))
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
        message: 'Cannot delete slots of a published event',
      });
    }

    const eventAssignments = await repositories.assignments.listByEvent(
      churchId,
      slot.eventId,
    );
    const assignmentCount = eventAssignments.filter(
      (a) =>
        a.slotId === slot.id &&
        ['draft', 'pending', 'confirmed'].includes(a.status),
    ).length;

    if (assignmentCount > 0 && !input.force) {
      // Client shows a confirmation dialog; deletion happens on force:true.
      return { success: false, assignmentCount };
    }

    await repositories.timeSlots.deleteById(churchId, slot.id);
    return { success: true, assignmentCount };
  });
