import { createFileRoute } from '@tanstack/react-router';
import { MyMinistrySchedulePage } from '@/features/volunteers/components/my-ministry-schedule-page';
import { CapabilityGate } from '@/shared/components/capability-gate';

export const Route = createFileRoute(
  '/_authenticated/_active-church/my-schedule/$ministryId/$cycleId',
)({
  component: MyMinistryScheduleRoute,
});

function MyMinistryScheduleRoute() {
  const { ministryId, cycleId } = Route.useParams();
  return (
    <CapabilityGate
      allow={({ hasVolunteerMembership }) => hasVolunteerMembership}
      refusal="not-serving"
    >
      <MyMinistrySchedulePage ministryId={ministryId} cycleId={cycleId} />
    </CapabilityGate>
  );
}
