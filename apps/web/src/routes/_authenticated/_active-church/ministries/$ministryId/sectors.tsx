import { createFileRoute } from '@tanstack/react-router';
import { SectorRegistry } from '@/features/ministries/components/sector-registry';

export const Route = createFileRoute(
  '/_authenticated/_active-church/ministries/$ministryId/sectors',
)({
  component: MinistrySectorsRoute,
});

function MinistrySectorsRoute() {
  const { ministryId } = Route.useParams();
  return <SectorRegistry ministryId={ministryId} />;
}
