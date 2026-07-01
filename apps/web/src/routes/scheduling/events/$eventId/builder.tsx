import { createFileRoute } from '@tanstack/react-router';
import { ScheduleBuilder } from '@/features/scheduling/components/builder/schedule-builder';

export const Route = createFileRoute('/scheduling/events/$eventId/builder')({
  component: BuilderPage,
});

function BuilderPage() {
  const { eventId } = Route.useParams();
  return <ScheduleBuilder eventId={eventId} />;
}
