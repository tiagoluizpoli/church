import { z } from 'zod';
import { listMinistrySchedule } from '../../services/volunteer-dashboard/list-ministry-schedule';
import { protectedProcedure } from '../../trpc';
import { getCurrentVolunteer } from './shared';

export const getMinistrySchedule = protectedProcedure
  .input(
    z.object({
      ministryId: z.string(),
    }),
  )
  .query(async ({ ctx, input }) => {
    const volunteer = await getCurrentVolunteer(ctx.session.user.id);

    return listMinistrySchedule({
      volunteer,
      ministryId: input.ministryId,
    });
  });
