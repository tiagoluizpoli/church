import { createFileRoute } from '@tanstack/react-router';
import { MySchedulePage } from '@/features/volunteers/components/my-schedule-page';
import { CapabilityGate } from '@/shared/components/capability-gate';

export const Route = createFileRoute(
  '/_authenticated/_active-church/my-schedule/',
)({
  component: MyScheduleRoute,
});

function MyScheduleRoute() {
  return (
    <CapabilityGate
      allow={({ hasVolunteerMembership }) => hasVolunteerMembership}
      refusal="not-serving"
    >
      <MySchedulePage />
    </CapabilityGate>
  );
}
