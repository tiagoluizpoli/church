import { createFileRoute, Link } from '@tanstack/react-router';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { EventList } from '@/features/scheduling/components/event-list';
import { SchedulingNav } from '@/features/scheduling/components/scheduling-nav';

export const Route = createFileRoute('/scheduling/')({
  component: SchedulingIndex,
});

function SchedulingIndex() {
  return (
    <WorkspacePage>
      <SchedulingNav />

      <WorkspaceIntroPanel
        title="Scheduling workspace"
        description="Move between calendar planning, ministry tailoring, and builder-ready events without losing context. This surface is the live list of events that are ready for roster work."
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/scheduling/tailoring"
              className="radius-control inline-flex min-h-11 items-center justify-center border border-border bg-background px-4 font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Open tailoring
            </Link>
            <Link
              to="/scheduling/planning"
              className="radius-control inline-flex min-h-11 items-center justify-center bg-primary px-4 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90"
            >
              Open planning
            </Link>
          </div>
        }
      />

      <EventList />
    </WorkspacePage>
  );
}
