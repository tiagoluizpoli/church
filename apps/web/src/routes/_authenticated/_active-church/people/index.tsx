import { createFileRoute } from '@tanstack/react-router';
import { PeopleDirectoryPage } from '@/features/people/components/people-directory-page';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { isAdminOrLeader } from '@/shared/hooks/use-caller-capabilities';

export const Route = createFileRoute('/_authenticated/_active-church/people/')({
  component: PeoplePage,
});

function PeoplePage() {
  return (
    <CapabilityGate allow={isAdminOrLeader} refusal="no-access">
      <PeopleDirectoryPage />
    </CapabilityGate>
  );
}
