import { createFileRoute } from '@tanstack/react-router';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { VolunteerAvailabilityPage } from '@/features/volunteers/components/volunteer-availability-page';

export const Route = createFileRoute(
  '/_authenticated/_active-church/volunteer/availability',
)({
  component: VolunteerAvailabilityRoute,
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
