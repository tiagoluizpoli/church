import { m } from '@church/i18n/messages';
import { createFileRoute } from '@tanstack/react-router';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { ComingSoonPage } from '@/shared/components/coming-soon-page';

export const Route = createFileRoute(
  '/_authenticated/_active-church/my-schedule/',
)({
  component: MySchedulePage,
});

function MySchedulePage() {
  return (
    <CapabilityGate
      allow={({ hasVolunteerMembership }) => hasVolunteerMembership}
      refusal="not-serving"
    >
      <ComingSoonPage title={m.nav_my_schedule()} />
    </CapabilityGate>
  );
}
