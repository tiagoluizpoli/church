import { createFileRoute, Link } from '@tanstack/react-router';
import { z } from 'zod';
import { buttonVariants } from '@/components/ui/button';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { EventList } from '@/features/scheduling/components/event-list';

const builderEventsSearchSchema = z.object({
  ministryId: z.string().optional(),
});

export const Route = createFileRoute('/scheduling/builder-events')({
  validateSearch: (search) => builderEventsSearchSchema.parse(search),
  component: BuilderEventsRoute,
});

function BuilderEventsRoute() {
  const search = Route.useSearch();

  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title="Scheduling workspace"
        description="Move between calendar planning, ministry tailoring, and builder-ready events without losing context. This surface is the live list of events that are ready for roster work."
        autoFocusTitle
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/scheduling/tailoring"
              className={buttonVariants({ variant: 'outline' })}
            >
              Open tailoring
            </Link>
            <Link
              to="/scheduling/planning-cycles"
              className={buttonVariants({ variant: 'default' })}
            >
              Open cycles
            </Link>
          </div>
        }
      />

      <EventList initialMinistryId={search.ministryId} />
    </WorkspacePage>
  );
}
