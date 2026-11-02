import { createFileRoute } from '@tanstack/react-router';
import { MinistryListPage } from '@/features/ministries/components/ministry-list-page';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { isAdminOrLeader } from '@/shared/hooks/use-caller-capabilities';

export const Route = createFileRoute(
  '/_authenticated/_active-church/ministries/',
)({
  component: MinistriesPage,
});

function MinistriesPage() {
  return (
    <CapabilityGate allow={isAdminOrLeader} refusal="no-access">
      <MinistryListPage />
    </CapabilityGate>
  );
}
