import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { VolunteerNotificationId } from '../../domain/entities/volunteer-notification';
import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { getCurrentVolunteer } from './shared';

export const markNotificationRead = protectedProcedure
  .input(
    z.object({
      notificationId: z.string(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const volunteer = await getCurrentVolunteer(ctx.session.user.id);
    const readAt = await repositories.volunteerNotifications.markRead(
      volunteer.churchId,
      volunteer.id,
      input.notificationId as VolunteerNotificationId,
    );

    if (!readAt) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Notification not found',
      });
    }

    return {
      success: true as const,
      readAt: readAt.toISOString(),
    };
  });
