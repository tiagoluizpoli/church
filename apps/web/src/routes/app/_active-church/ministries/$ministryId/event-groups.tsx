import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { EventGroupsEditor } from '@/features/ministries/components/event-groups-editor';

/** `cycleId`: the Schedule whose export dialog led here, to link back to. */
const eventGroupsSearchSchema = z.object({
  cycleId: z.string().optional().catch(undefined),
});

export const Route = createFileRoute(
  '/app/_active-church/ministries/$ministryId/event-groups',
)({
  validateSearch: eventGroupsSearchSchema,
  component: MinistryEventGroupsRoute,
});

function MinistryEventGroupsRoute() {
  const { ministryId } = Route.useParams();
  const { cycleId } = Route.useSearch();
  return <EventGroupsEditor ministryId={ministryId} cycleId={cycleId} />;
}
