import { createFileRoute } from '@tanstack/react-router';
import { MinistryRoles } from '@/features/ministries/components/ministry-roles';

export const Route = createFileRoute(
  '/_authenticated/_active-church/ministries/$ministryId/roles',
)({
  component: MinistryRolesRoute,
});

function MinistryRolesRoute() {
  const { ministryId } = Route.useParams();
  return <MinistryRoles ministryId={ministryId} />;
}
