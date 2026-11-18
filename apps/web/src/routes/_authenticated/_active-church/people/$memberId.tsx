import { createFileRoute } from '@tanstack/react-router';
import { MemberDetailPage } from '@/features/people/components/member-detail-page';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { isAdminOrLeader } from '@/shared/hooks/use-caller-capabilities';

export const Route = createFileRoute(
  '/_authenticated/_active-church/people/$memberId',
)({
  component: MemberDetailRoute,
});

function MemberDetailRoute() {
  const { memberId } = Route.useParams();
  return (
    <CapabilityGate allow={isAdminOrLeader} refusal="no-access">
      <MemberDetailPage memberId={memberId} />
    </CapabilityGate>
  );
}
