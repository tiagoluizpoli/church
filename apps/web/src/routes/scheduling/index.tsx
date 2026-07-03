import { createFileRoute, Link } from '@tanstack/react-router';
import { EventList } from '@/features/scheduling/components/event-list';

export const Route = createFileRoute('/scheduling/')({
  component: SchedulingIndex,
});

function SchedulingIndex() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-xl">Scheduling</h1>
          <p className="text-muted-foreground text-sm">
            Builder events live here. Cycle planning lives in the admin planning
            surface.
          </p>
        </div>
        <Link
          to="/scheduling/planning"
          className="inline-flex h-7 items-center justify-center border px-2.5 text-xs hover:bg-muted"
        >
          Open planning
        </Link>
      </div>
      <EventList />
    </div>
  );
}
