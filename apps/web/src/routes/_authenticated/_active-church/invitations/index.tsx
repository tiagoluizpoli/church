import { createFileRoute } from '@tanstack/react-router';
import { InvitationListPage } from '@/features/invitations/components/invitation-list-page';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { isAdminOrLeader } from '@/shared/hooks/use-caller-capabilities';

export const Route = createFileRoute(
  '/_authenticated/_active-church/invitations/',
)({
  component: InvitationsPage,
});

function InvitationsPage() {
  return (
    <CapabilityGate allow={isAdminOrLeader} refusal="no-access">
      <InvitationListPage />
    </CapabilityGate>
  );
}
