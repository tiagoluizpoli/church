import { z } from 'zod';
import type { ChurchId } from '../../domain/entities/church';
import type { MinistryId } from '../../domain/entities/ministry';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { authorizeLeaderOrAdmin } from './authorize';

export const listEvents = protectedProcedure
  .input(z.object({ ministryId: z.string() }))
  .query(async ({ input, ctx }) => {
    const authCtx = await authorizeLeaderOrAdmin(
      ctx.session.user.id,
      input.ministryId,
    );

    const events = await repositories.events.listByMinistry(
      authCtx.churchId as ChurchId,
      input.ministryId as MinistryId,
    );

    return events
      .map((event) => ({
        id: event.id,
        title: event.title,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        status: event.status,
        eventType: event.eventType,
      }))
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  });
