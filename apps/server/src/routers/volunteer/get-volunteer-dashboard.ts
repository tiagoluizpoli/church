import { buildDashboardSnapshot } from '../../services/volunteer-dashboard/build-dashboard-snapshot';
import { protectedProcedure } from '../../trpc';
import { getCurrentVolunteer } from './shared';

export const getVolunteerDashboard = protectedProcedure.query(
  async ({ ctx }) => {
    const volunteer = await getCurrentVolunteer(ctx.session.user.id);

    return buildDashboardSnapshot({ volunteer });
  },
);
