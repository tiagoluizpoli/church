import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { CycleBuilder } from '@/features/scheduling/components/builder/cycle-builder';
import { useCycleBuilder } from '@/features/scheduling/hooks/use-cycle-builder';
import { adminApi } from '@/utils/api-instances';

export const Route = createFileRoute(
  '/scheduling/rostering/$ministryId/$cycleId',
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
  const cycleQuery = useQuery({
    queryKey: ['rostering-cycle', cycleId],
    queryFn: () => adminApi.getPlanningCycle(cycleId),
    retry: false,
  });

  if (query.isError) {
    return (
      <div className="rounded border border-destructive p-4 text-destructive text-sm">
        {query.error?.message ?? 'Failed to load cycle builder'}
      </div>
    );
  }

  if (query.isLoading || cycleQuery.isLoading || !data || !cycleQuery.data) {
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
        cycleName={cycleQuery.data.cycle.name}
        cycleStartDate={cycleQuery.data.cycle.startDate}
        cycleEndDate={cycleQuery.data.cycle.endDate}
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
