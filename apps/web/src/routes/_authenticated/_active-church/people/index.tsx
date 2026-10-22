import { m } from '@church/i18n/messages';
import { createFileRoute } from '@tanstack/react-router';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { ComingSoonPage } from '@/shared/components/coming-soon-page';
import { isAdminOrLeader } from '@/shared/hooks/use-caller-capabilities';

export const Route = createFileRoute('/_authenticated/_active-church/people/')({
  component: PeoplePage,
});

function PeoplePage() {
  return (
    <CapabilityGate allow={isAdminOrLeader} refusal="no-access">
      <ComingSoonPage title={m.nav_people()} />
    </CapabilityGate>
  );
}
