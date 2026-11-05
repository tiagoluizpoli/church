import { createFileRoute } from '@tanstack/react-router';
import { EventCreatePage } from '@/features/scheduling/components/planning-admin/event-create-page';

export const Route = createFileRoute(
  '/_authenticated/_active-church/_planning-admin/cycles/$cycleId/events/new',
)({
  component: EventCreateRoute,
});

function EventCreateRoute() {
  const { cycleId } = Route.useParams();
  return <EventCreatePage cycleId={cycleId} />;
}
