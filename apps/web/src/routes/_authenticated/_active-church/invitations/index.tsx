import { m } from '@church/i18n/messages';
import { createFileRoute } from '@tanstack/react-router';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { ComingSoonPage } from '@/shared/components/coming-soon-page';

export const Route = createFileRoute(
  '/_authenticated/_active-church/invitations/',
)({
  component: InvitationsPage,
});

function InvitationsPage() {
  return (
    <CapabilityGate
      allow={({ isChurchAdmin, leadsMinistries }) =>
        isChurchAdmin || leadsMinistries
      }
      refusal="no-access"
    >
      <ComingSoonPage title={m.nav_invitations()} />
    </CapabilityGate>
  );
}
