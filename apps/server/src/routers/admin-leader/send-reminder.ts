import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { ChurchId } from '../../domain/entities/church';
import type { EventId } from '../../domain/entities/event';
import type { UserId, VolunteerId } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';
import { notificationService } from '../../infrastructure/services/local-notification-service';
import { protectedProcedure } from '../../trpc';
import { authorizeLeaderOrAdmin } from './authorize';

export const sendReminder = protectedProcedure
  .input(z.object({ eventId: z.string() }))
  .mutation(async ({ input, ctx }) => {
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

    const volunteers = await repositories.volunteers.listByMinistry(
      churchId,
      event.ministryId,
    );
    const volunteerIds = volunteers.map((v) => v.id);

    const availabilityEntries =
      await repositories.availability.listByVolunteers(
        churchId,
        volunteerIds as VolunteerId[],
      );

    // Volunteers with event-scoped answers already submitted for this event.
    const hasAvailability = new Set(
      availabilityEntries
        .filter((entry) => entry.eventId === event.id)
        .map((b) => b.volunteerId as string),
    );

    const nonResponders = volunteers.filter(
      (v) => !hasAvailability.has(v.id as string),
    );

    for (const v of nonResponders) {
      await notificationService.notifyVolunteer({
        churchId,
        volunteerId: v.id,
        ministryId: event.ministryId,
        eventId: event.id,
        type: 'availability_reminder',
        title: 'Availability reminder',
        body: `Please share your availability for ${event.title}.`,
        payload: {
          eventId: event.id,
          ministryId: event.ministryId,
          section: 'availability',
        },
      });
      await notificationService.notifyReminder({
        churchId,
        eventId: input.eventId,
        volunteerId: v.id,
      });
    }

    return { notifiedCount: nonResponders.length };
  });
