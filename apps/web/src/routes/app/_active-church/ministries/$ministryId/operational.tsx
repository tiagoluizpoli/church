import { createFileRoute } from '@tanstack/react-router';
import { MinistryRoles } from '@/features/ministries/components/ministry-roles';
import { SectorRegistry } from '@/features/ministries/components/sector-registry';

export const Route = createFileRoute(
  '/app/_active-church/ministries/$ministryId/operational',
)({ component: MinistryOperationalRoute });

function MinistryOperationalRoute() {
  const { ministryId } = Route.useParams();
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <SectorRegistry ministryId={ministryId} />
      <MinistryRoles ministryId={ministryId} />
    </div>
  );
}
