import { NotFoundError } from '@church/core';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { ChurchId } from '../../domain/entities/church';
import type { RoleId } from '../../domain/entities/role';
import type { TimeSlotId } from '../../domain/entities/time-slot';
import type { UserId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { authorizeLeaderOrAdmin } from './authorize';

export const upsertSlotRequirement = protectedProcedure
  .input(
    z.object({
      timeSlotId: z.string(),
      roleId: z.string(),
      count: z.number().int().min(1),
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

    // 2. Fetch the slot
    const slot = await repositories.timeSlots
      .getById(churchId, input.timeSlotId as TimeSlotId)
      .catch(() => null);

    if (!slot) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Time slot not found',
      });
    }

    // We need the event's ministryId to authorize. Fetch the event.
    const event = await repositories.events
      .getById(slot.churchId, slot.eventId)
      .catch(() => null);

    if (!event) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
    }

    // 2. Authorize
    const authCtx = await authorizeLeaderOrAdmin(
      ctx.session.user.id,
      event.ministryId,
    );

    // Cross-church guard
    if (slot.churchId !== authCtx.churchId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Cross-church access denied',
      });
    }

    // 3. Verify the role belongs to this church and ministry (or is global)
    const role = await repositories.roles
      .getById(authCtx.churchId as ChurchId, input.roleId as RoleId)
      .catch((err) => {
        if (err instanceof NotFoundError) return null;
        throw err;
      });

    if (!role) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Role not found' });
    }

    if (role.ministryId !== event.ministryId && !role.isGlobal) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Role must be global or belong to the target ministry',
      });
    }

    // 4. Upsert the slot requirement via the TimeSlotRepository
    const requirement = await repositories.timeSlots.upsertRequirement(
      authCtx.churchId as ChurchId,
      input.timeSlotId as TimeSlotId,
      {
        roleId: input.roleId as RoleId,
        requiredCount: input.count,
      },
    );

    // 5. Check for overstaffing warning
    const activeCount = await repositories.timeSlots.countActiveAssignments(
      authCtx.churchId as ChurchId,
      input.timeSlotId as TimeSlotId,
      input.roleId as RoleId,
    );

    let warning: string | undefined;
    if (activeCount > requirement.requiredCount) {
      warning = `Slot is overstaffed: ${activeCount} assignments exist for requirement count ${requirement.requiredCount}`;
    }

    return {
      requirement: {
        id: requirement.id,
        slotId: requirement.slotId,
        roleId: requirement.roleId,
        requiredCount: requirement.requiredCount,
      },
      warning,
    };
  });
