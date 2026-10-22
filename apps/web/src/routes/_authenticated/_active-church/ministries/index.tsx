import { m } from '@church/i18n/messages';
import { createFileRoute } from '@tanstack/react-router';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { ComingSoonPage } from '@/shared/components/coming-soon-page';

export const Route = createFileRoute(
  '/_authenticated/_active-church/ministries/',
)({
  component: MinistriesPage,
});

function MinistriesPage() {
  return (
    <CapabilityGate
      allow={({ isChurchAdmin, leadsMinistries }) =>
        isChurchAdmin || leadsMinistries
      }
      refusal="no-access"
    >
      <ComingSoonPage title={m.nav_ministries()} />
    </CapabilityGate>
  );
}
