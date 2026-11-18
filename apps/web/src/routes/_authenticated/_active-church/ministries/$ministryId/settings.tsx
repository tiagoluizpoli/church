import { createFileRoute } from '@tanstack/react-router';
import { MinistrySettings } from '@/features/ministries/components/ministry-settings';

export const Route = createFileRoute(
  '/_authenticated/_active-church/ministries/$ministryId/settings',
)({
  component: MinistrySettingsRoute,
});

function MinistrySettingsRoute() {
  const { ministryId } = Route.useParams();
  return <MinistrySettings ministryId={ministryId} />;
}
