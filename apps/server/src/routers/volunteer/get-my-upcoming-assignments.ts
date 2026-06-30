import { buildDashboardSnapshot } from '../../services/volunteer-dashboard/build-dashboard-snapshot';
import { protectedProcedure } from '../../trpc';
import { getCurrentVolunteer } from './shared';

export const getMyUpcomingAssignments = protectedProcedure.query(
  async ({ ctx }) => {
    const volunteer = await getCurrentVolunteer(ctx.session.user.id);
    const snapshot = await buildDashboardSnapshot({ volunteer });

    return snapshot.upcomingAssignmentGroups;
  },
);
