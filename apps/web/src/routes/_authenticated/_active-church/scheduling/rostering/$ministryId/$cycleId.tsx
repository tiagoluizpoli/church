import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { z } from 'zod';
import { Skeleton } from '@/components/ui/skeleton';
import { CycleBuilder } from '@/features/scheduling/components/builder/cycle-builder';
import { useCycleBuilder } from '@/features/scheduling/hooks/use-cycle-builder';
import { adminApi } from '@/utils/api-instances';

export const Route = createFileRoute(
  '/_authenticated/_active-church/scheduling/rostering/$ministryId/$cycleId',
)({
  component: EventBuilderRoute,
  validateSearch: z.object({ teamId: z.string().optional() }),
});

// Shell host for the cycle-centric Event Builder canvas (US1/US2/US3/US6).
// It loads the batched builder read model and owns assignment mutations.
function EventBuilderRoute() {
  const { ministryId, cycleId } = Route.useParams();
  const { teamId } = Route.useSearch();
  const navigate = useNavigate();
  const {
    data,
    publish,
    query,
    createAssignment,
    deleteAssignment,
    reassignAssignment,
    isReadOnly,
  } = useCycleBuilder({ cycleId, ministryId, teamId });
  const cycleQuery = useQuery({
    queryKey: ['rostering-cycle', cycleId],
    queryFn: () => adminApi.getPlanningCycle(cycleId),
    retry: false,
    enabled: !teamId,
  });

  useEffect(() => {
    if (query.isError) {
      void navigate({ to: '/scheduling', replace: true });
    }
  }, [navigate, query.isError]);

  if (query.isError) {
    return (
      <div className="rounded border border-destructive p-4 text-destructive text-sm">
        {query.error?.message ?? 'Failed to load cycle builder'}
      </div>
    );
  }

  if (
    query.isLoading ||
    (!teamId && (cycleQuery.isLoading || !cycleQuery.data)) ||
    !data
  ) {
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
        isReadOnly={isReadOnly}
        cycleName={teamId ? 'Team roster' : cycleQuery.data?.cycle.name}
        cycleStartDate={teamId ? undefined : cycleQuery.data?.cycle.startDate}
        cycleEndDate={teamId ? undefined : cycleQuery.data?.cycle.endDate}
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
