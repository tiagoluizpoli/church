import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { ChurchId } from '../../domain/entities/church';
import type { EventId } from '../../domain/entities/event';
import type { TimeSlotId } from '../../domain/entities/time-slot';
import type { UserId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { authorizeLeaderOrAdmin } from './authorize';

export const createSlot = protectedProcedure
  .input(
    z.object({
      eventId: z.string(),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      label: z.string().max(255).optional(),
      copyRequirementsFromSlotId: z.string().optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const startTime = new Date(input.startTime);
    const endTime = new Date(input.endTime);
    if (startTime >= endTime) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'startTime must be before endTime',
      });
    }

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
    const churchId = authCtx.churchId as ChurchId;

    if (event.status === 'published') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot add slots to a published event',
      });
    }

    const overlapping = await repositories.timeSlots.findOverlapping(
      churchId,
      input.eventId as EventId,
      startTime,
      endTime,
    );
    if (overlapping.length > 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Slot time overlaps an existing slot',
      });
    }

    const slot = await repositories.timeSlots.create(churchId, {
      eventId: input.eventId as EventId,
      startTime,
      endTime,
      label: input.label,
    });

    const requirements: Array<{
      id: string;
      slotId: string;
      roleId: string;
      requiredCount: number;
    }> = [];

    if (input.copyRequirementsFromSlotId) {
      const source = await repositories.timeSlots
        .getById(churchId, input.copyRequirementsFromSlotId as TimeSlotId)
        .catch(() => null);
      if (source) {
        for (const req of source.requirements) {
          const created = await repositories.timeSlots.upsertRequirement(
            churchId,
            slot.id,
            {
              roleId: req.roleId,
              requiredCount: req.requiredCount,
              teamId: req.teamId,
              notes: req.notes,
            },
          );
          requirements.push({
            id: created.id,
            slotId: created.slotId,
            roleId: created.roleId,
            requiredCount: created.requiredCount,
          });
        }
      }
    }

    return {
      id: slot.id,
      eventId: input.eventId,
      startTime: slot.startTime.toISOString(),
      endTime: slot.endTime.toISOString(),
      label: slot.label ?? null,
      requirements,
    };
  });
