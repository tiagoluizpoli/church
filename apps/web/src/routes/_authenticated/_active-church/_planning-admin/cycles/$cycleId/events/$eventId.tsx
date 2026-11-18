import { createFileRoute } from '@tanstack/react-router';
import { EventEditPage } from '@/features/scheduling/components/planning-admin/event-edit-page';

export const Route = createFileRoute(
  '/_authenticated/_active-church/_planning-admin/cycles/$cycleId/events/$eventId',
)({
  component: EventEditRoute,
});

function EventEditRoute() {
  const { cycleId, eventId } = Route.useParams();
  return <EventEditPage cycleId={cycleId} eventId={eventId} />;
}
