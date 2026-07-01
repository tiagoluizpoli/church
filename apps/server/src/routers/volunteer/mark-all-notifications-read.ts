import { repositories } from '../../infrastructure/repositories/registry';
import { protectedProcedure } from '../../trpc';
import { getCurrentVolunteer } from './shared';

export const markAllNotificationsRead = protectedProcedure.mutation(
  async ({ ctx }) => {
    const volunteer = await getCurrentVolunteer(ctx.session.user.id);
    const updatedCount = await repositories.volunteerNotifications.markAllRead(
      volunteer.churchId,
      volunteer.id,
    );

    return {
      success: true as const,
      updatedCount,
    };
  },
);
