import { z } from 'zod';
import { repositories } from '../../infrastructure/repositories/registry';
import {
  buildDashboardSnapshot,
  buildNotificationLinkContext,
} from '../../services/volunteer-dashboard/build-dashboard-snapshot';
import { mapNotificationLink } from '../../services/volunteer-dashboard/map-notification-link';
import { protectedProcedure } from '../../trpc';
import { getCurrentVolunteer } from './shared';

export const getMyNotifications = protectedProcedure
  .input(
    z.object({
      cursor: z.string().datetime().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
  )
  .query(async ({ input, ctx }) => {
    const volunteer = await getCurrentVolunteer(ctx.session.user.id);
    const snapshot = await buildDashboardSnapshot({ volunteer });
    const currentContext = buildNotificationLinkContext(snapshot);
    const result = await repositories.volunteerNotifications.listByVolunteer(
      volunteer.churchId,
      {
        volunteerId: volunteer.id,
        cursor: input.cursor ? new Date(input.cursor) : undefined,
        limit: input.limit ?? 20,
      },
    );

    return {
      items: result.items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.body,
        readAt: item.readAt?.toISOString(),
        createdAt: item.createdAt.toISOString(),
        deepLink: mapNotificationLink({
          payload: item.payload,
          currentContext,
        }),
      })),
      nextCursor: result.nextCursor?.toISOString(),
    };
  });
