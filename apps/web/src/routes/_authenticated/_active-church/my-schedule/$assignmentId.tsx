import { createFileRoute } from '@tanstack/react-router';
import { AssignmentDetailPage } from '@/features/volunteers/components/assignment-detail-page';
import { CapabilityGate } from '@/shared/components/capability-gate';

export const Route = createFileRoute(
  '/_authenticated/_active-church/my-schedule/$assignmentId',
)({
  component: AssignmentRoute,
});

function AssignmentRoute() {
  const { assignmentId } = Route.useParams();
  return (
    <CapabilityGate
      allow={({ hasVolunteerMembership }) => hasVolunteerMembership}
      refusal="not-serving"
    >
      <AssignmentDetailPage key={assignmentId} assignmentId={assignmentId} />
    </CapabilityGate>
  );
}
