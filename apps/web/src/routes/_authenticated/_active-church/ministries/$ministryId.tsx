import { createFileRoute } from '@tanstack/react-router';
import { MinistryWorkspace } from '@/features/ministries/components/ministry-workspace';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { isAdminOrLeader } from '@/shared/hooks/use-caller-capabilities';

export const Route = createFileRoute(
  '/_authenticated/_active-church/ministries/$ministryId',
)({
  component: MinistryWorkspaceRoute,
});

function MinistryWorkspaceRoute() {
  const { ministryId } = Route.useParams();
  return (
    <CapabilityGate allow={isAdminOrLeader} refusal="no-access">
      <MinistryWorkspace ministryId={ministryId} />
    </CapabilityGate>
  );
}
