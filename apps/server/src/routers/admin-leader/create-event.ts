import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { ChurchId } from '../../domain/entities/church';
import type { MinistryId } from '../../domain/entities/ministry';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { authorizeLeaderOrAdmin } from './authorize';

export const createEvent = protectedProcedure
  .input(
    z.object({
      ministryId: z.string(),
      title: z.string().min(1).max(255),
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
      eventType: z.enum(['hourly', 'day_based']).default('hourly'),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    if (startDate >= endDate) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'startDate must be before endDate',
      });
    }

    // Authorize against the target ministry
    const authCtx = await authorizeLeaderOrAdmin(
      ctx.session.user.id,
      input.ministryId,
    );

    const event = await repositories.events.create(
      authCtx.churchId as ChurchId,
      {
        ministryId: input.ministryId as MinistryId,
        title: input.title,
        startDate,
        endDate,
        eventType: input.eventType,
        status: 'draft',
      },
    );

    return {
      id: event.id,
      title: event.title,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      eventType: event.eventType,
      status: 'draft' as const,
      ministryId: event.ministryId,
    };
  });
