import { createFileRoute } from '@tanstack/react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { CycleBuilder } from '@/features/scheduling/components/builder/cycle-builder';
import { useCycleBuilder } from '@/features/scheduling/hooks/use-cycle-builder';
import { useSchedulingAccessFallback } from '@/shared/hooks/use-scheduling-access-fallback';

export const Route = createFileRoute(
  '/_authenticated/_active-church/schedules/$ministryId/$cycleId/assign',
)({
  component: EventBuilderRoute,
});

// Shell host for the cycle-centric Event Builder canvas (US1/US2/US3/US6).
// It loads the batched builder read model and owns assignment mutations.
function EventBuilderRoute() {
  const { ministryId, cycleId } = Route.useParams();
  const {
    data,
    publish,
    query,
    createAssignment,
    deleteAssignment,
    reassignAssignment,
  } = useCycleBuilder({ cycleId, ministryId });

  useSchedulingAccessFallback({ shouldRedirect: query.isError });

  if (query.isError) {
    return null;
  }

  if (query.isLoading || !query.data || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div
      data-testid="event-builder-route"
      data-ministry-id={ministryId}
      data-cycle-id={cycleId}
    >
      <CycleBuilder
        data={data}
        cycleId={cycleId}
        ministryId={ministryId}
        cycleName={query.data.cycle.name}
        cycleStartDate={query.data.cycle.startDate}
        cycleEndDate={query.data.cycle.endDate}
        isPublishing={publish.isPending}
        onPublish={(confirmBelowFull) => publish.mutate(confirmBelowFull)}
        createAssignment={createAssignment}
        deleteAssignment={deleteAssignment}
        reassignAssignment={reassignAssignment}
        syncedAt={query.dataUpdatedAt}
        isRefreshing={query.isFetching}
      />
    </div>
  );
}
