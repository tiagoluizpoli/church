import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { VolunteerDashboard } from '@/features/volunteers/components/volunteer-dashboard';
import { authClient } from '@/lib/auth-client';

const dashboardSearchSchema = z.object({
  section: z
    .enum(['availability', 'assignments', 'notifications', 'ministry_schedule'])
    .optional(),
  eventId: z.string().optional(),
  assignmentId: z.string().optional(),
  ministryId: z.string().optional(),
});

export const Route = createFileRoute('/dashboard')({
  validateSearch: (search) => dashboardSearchSchema.parse(search),
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({
        to: '/login',
        throw: true,
      });
    }
    return { session };
  },
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const search = Route.useSearch();

  return (
    <div className="container mx-auto px-4 py-10">
      <VolunteerDashboard
        volunteerName={session.data?.user.name}
        initialSection={search.section}
        initialEventId={search.eventId}
        initialAssignmentId={search.assignmentId}
        initialMinistryId={search.ministryId}
      />
    </div>
  );
}
