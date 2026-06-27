import { createFileRoute } from '@tanstack/react-router';
import { EventList } from '@/features/scheduling/components/event-list';

export const Route = createFileRoute('/scheduling/')({
  component: SchedulingIndex,
});

function SchedulingIndex() {
  return <EventList />;
}
