import { createFileRoute, redirect } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ScheduleBuilder } from '@/features/scheduling/components/builder/schedule-builder';
import { trpcClient } from '@/utils/trpc';

export const Route = createFileRoute('/scheduling/events/$eventId/builder')({
  // Block non-leaders: anyone who leads no ministries cannot reach the builder.
  // Per-ministry authorization is still enforced server-side by
  // getScheduleBuilderData (authorizeLeaderOrAdmin).
  beforeLoad: async () => {
    const ministries = await trpcClient.adminLeader.listMyMinistries.query();
    if (ministries.length === 0) {
      toast.error("You don't have access to the schedule builder");
      throw redirect({ to: '/scheduling' });
    }
  },
  component: BuilderPage,
});

function BuilderPage() {
  const { eventId } = Route.useParams();
  return <ScheduleBuilder eventId={eventId} />;
}
