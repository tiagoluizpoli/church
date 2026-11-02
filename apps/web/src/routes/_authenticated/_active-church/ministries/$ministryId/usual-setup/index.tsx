import { createFileRoute } from '@tanstack/react-router';
import { UsualSetupList } from '@/features/ministries/components/usual-setup/usual-setup-list';

export const Route = createFileRoute(
  '/_authenticated/_active-church/ministries/$ministryId/usual-setup/',
)({
  component: MinistryUsualSetupRoute,
});

function MinistryUsualSetupRoute() {
  const { ministryId } = Route.useParams();
  return <UsualSetupList ministryId={ministryId} />;
}
