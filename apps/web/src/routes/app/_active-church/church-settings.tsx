import { createFileRoute } from '@tanstack/react-router';
import { ChurchSettingsPage } from '@/features/church-settings/components/church-settings-page';
import { CapabilityGate } from '@/shared/components/capability-gate';

export const Route = createFileRoute('/app/_active-church/church-settings')({
  component: ChurchSettingsRoute,
});

function ChurchSettingsRoute() {
  return (
    <CapabilityGate allow={(c) => c.isChurchAdmin} refusal="no-access">
      <ChurchSettingsPage />
    </CapabilityGate>
  );
}
