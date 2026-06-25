import { NotFoundError } from '@church/core';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { ChurchId } from '../../domain/entities/church';
import type { EventId } from '../../domain/entities/event';
import type { UserId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';
import { notificationService } from '../../infrastructure/services/local-notification-service';
import { protectedProcedure } from '../../trpc';
import { authorizeLeaderOrAdmin } from './authorize';

export const cancelEvent = protectedProcedure
  .input(
    z.object({
      eventId: z.string(),
      reason: z.string().min(1, 'Cancellation reason is required'),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    // 1. Resolve volunteer from session user globally to get churchId
    const vol = await repositories.volunteers.findByUserIdGlobally(
      ctx.session.user.id as UserId,
    );
    if (!vol) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Active volunteer profile not found',
      });
    }
    const churchId = vol.churchId;

    // 2. Fetch the event
    const event = await repositories.events
      .getById(churchId, input.eventId as EventId)
      .catch((err) => {
        if (err instanceof NotFoundError) return null;
        throw err;
      });

    if (!event) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
    }

    // 3. Authorize
    const authCtx = await authorizeLeaderOrAdmin(
      ctx.session.user.id,
      event.ministryId,
    );

    if (event.churchId !== authCtx.churchId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Cross-church access denied',
      });
    }

    // 3. Guard — only draft or published events can be cancelled
    if (!['draft', 'published'].includes(event.status)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Event cannot be cancelled from status: ${event.status}`,
      });
    }

    // 4. Fetch all active assignments for this event
    const assignments = await repositories.assignments.listByEvent(
      authCtx.churchId as ChurchId,
      input.eventId as EventId,
    );

    const activeAssignments = assignments.filter((a) =>
      ['draft', 'pending', 'confirmed'].includes(a.status),
    );

    // 5. Atomic transaction: cancel event + cancel all active assignments
    await repositories.unitOfWork.run(async (tx) => {
      await repositories.events.updateStatus(
        authCtx.churchId as ChurchId,
        input.eventId as EventId,
        { status: 'cancelled' },
        tx,
      );

      for (const a of activeAssignments) {
        await repositories.assignments.updateStatus(
          authCtx.churchId as ChurchId,
          a.id,
          { status: 'cancelled' },
          tx,
        );

        await repositories.assignmentAudits.create(
          authCtx.churchId as ChurchId,
          {
            assignmentId: a.id,
            actorId: ctx.session.user.id as UserId,
            action: 'status_change',
            reason: input.reason,
          },
          tx,
        );
      }
    });

    // 6. Dispatch notifications
    await notificationService.publish({
      type: 'event_cancelled',
      churchId: authCtx.churchId,
      eventId: input.eventId,
      actorId: ctx.session.user.id,
      assignmentIds: activeAssignments.map((a) => a.id as string),
    });

    return {
      success: true,
      cancelledAssignmentCount: activeAssignments.length,
    };
  });
