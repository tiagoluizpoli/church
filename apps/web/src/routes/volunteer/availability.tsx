import { createFileRoute, redirect } from '@tanstack/react-router';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { VolunteerAvailabilityPage } from '@/features/volunteers/components/volunteer-availability-page';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/volunteer/availability')({
  component: VolunteerAvailabilityRoute,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: '/login', throw: true });
    }
    return { session };
  },
});

function VolunteerAvailabilityRoute() {
  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title="Availability checks"
        description="Mark the shifts you cannot serve, then confirm each check before your leader locks the schedule."
      />
      <VolunteerAvailabilityPage />
    </WorkspacePage>
  );
}
