import { NotFoundError } from '@church/core';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { AssignmentId } from '../../domain/entities/assignment';
import type { ChurchId } from '../../domain/entities/church';
import type { UserId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { authorizeLeaderOrAdmin } from './authorize';

export const deleteAssignment = protectedProcedure
  .input(z.object({ assignmentId: z.string() }))
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

    // 2. Fetch the assignment
    const assignmentEntity = await repositories.assignments
      .getById(churchId, input.assignmentId as AssignmentId)
      .catch((err) => {
        if (err instanceof NotFoundError) return null;
        throw err;
      });

    if (!assignmentEntity) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Assignment not found',
      });
    }

    // 2. Fetch the slot and event to get ministryId for authorization
    const slot = await repositories.timeSlots
      .getById(assignmentEntity.churchId, assignmentEntity.slotId)
      .catch(() => null);

    if (!slot) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Slot context not found',
      });
    }

    const event = await repositories.events
      .getById(slot.churchId, slot.eventId)
      .catch(() => null);

    if (!event) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Event context not found',
      });
    }

    // 3. Authorize
    const authCtx = await authorizeLeaderOrAdmin(
      ctx.session.user.id,
      event.ministryId,
    );

    if (slot.churchId !== authCtx.churchId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Cross-church access denied',
      });
    }

    // 4. Delete or cancel depending on status
    let transition: 'deleted' | 'cancelled';

    if (assignmentEntity.status === 'draft') {
      transition = 'deleted';
      await repositories.assignments.deleteById(
        authCtx.churchId as ChurchId,
        input.assignmentId as AssignmentId,
      );
    } else {
      transition = 'cancelled';
      await repositories.assignments.updateStatus(
        authCtx.churchId as ChurchId,
        input.assignmentId as AssignmentId,
        { status: 'cancelled' },
      );

      await repositories.assignmentAudits.create(authCtx.churchId as ChurchId, {
        assignmentId: input.assignmentId as AssignmentId,
        actorId: ctx.session.user.id as UserId,
        action: 'status_change',
        reason: 'Assignment removed',
      });
    }

    return { success: true, transition };
  });
