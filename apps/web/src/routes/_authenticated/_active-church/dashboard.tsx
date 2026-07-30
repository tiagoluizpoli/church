import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { VolunteerDashboard } from '@/features/volunteers/components/volunteer-dashboard';
import {
  membershipRemovedMessage,
  removedFromSearchSchema,
} from '@/shared/utils/membership-removal';

const dashboardSearchSchema = removedFromSearchSchema.extend({
  section: z
    .enum(['availability', 'assignments', 'ministry_schedule'])
    .optional(),
  eventId: z.string().optional(),
  assignmentId: z.string().optional(),
  ministryId: z.string().optional(),
});

export const Route = createFileRoute(
  '/_authenticated/_active-church/dashboard',
)({
  validateSearch: (search) => dashboardSearchSchema.parse(search),
  component: RouteComponent,
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const search = Route.useSearch();
  const volunteerName = session.data?.user.name;

  useEffect(() => {
    if (search.removedFrom) {
      toast.info(membershipRemovedMessage({ churchName: search.removedFrom }));
    }
  }, [search.removedFrom]);

  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title="Volunteer dashboard"
        description={
          volunteerName
            ? `Review what needs your attention, ${volunteerName}.`
            : 'Review what needs your attention.'
        }
        aside={
          <Link
            to="/volunteer/availability"
            className="radius-control inline-flex min-h-11 items-center justify-center border border-border bg-background px-4 font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            View availability checks
          </Link>
        }
      />
      <VolunteerDashboard
        initialSection={search.section}
        initialEventId={search.eventId}
        initialAssignmentId={search.assignmentId}
        initialMinistryId={search.ministryId}
      />
    </WorkspacePage>
  );
}
