import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { ChurchId } from '../../domain/entities/church';
import type { EventId } from '../../domain/entities/event';
import type { UserId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { authorizeLeaderOrAdmin } from './authorize';

export const listAuditLog = protectedProcedure
  .input(z.object({ eventId: z.string() }))
  .query(async ({ input, ctx }) => {
    const callerVol = await repositories.volunteers.findByUserIdGlobally(
      ctx.session.user.id as UserId,
    );
    if (!callerVol) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Active volunteer profile not found',
      });
    }

    const event = await repositories.events
      .getById(callerVol.churchId, input.eventId as EventId)
      .catch(() => null);
    if (!event) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
    }

    const authCtx = await authorizeLeaderOrAdmin(
      ctx.session.user.id,
      event.ministryId,
    );

    const entries = await repositories.assignmentAudits.listByEvent(
      authCtx.churchId as ChurchId,
      input.eventId as EventId,
    );

    // Only override actions carry a reason.
    return entries
      .filter((e) => e.reason != null)
      .map((e) => ({
        id: e.id,
        assignmentId: e.assignmentId,
        volunteerId: e.volunteerId,
        volunteerName: e.volunteerName,
        slotId: e.slotId,
        slotLabel: e.slotLabel,
        roleId: e.roleId,
        roleName: e.roleName,
        action: e.action,
        reason: e.reason,
        actorId: e.actorId,
        actorName: e.actorName,
        timestamp: e.timestamp.toISOString(),
      }));
  });
