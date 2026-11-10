import {
  createFileRoute,
  DefaultGlobalNotFound,
  notFound,
  useRouter,
} from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { CycleBuilder } from '@/features/scheduling/components/builder/cycle-builder';
import { useCycleBuilder } from '@/features/scheduling/hooks/use-cycle-builder';

export const Route = createFileRoute(
  '/_authenticated/_active-church/schedules/$ministryId/$cycleId/assign',
)({
  component: EventBuilderRoute,
  notFoundComponent: DefaultGlobalNotFound,
});

// Shell host for the cycle-centric Event Builder canvas (US1/US2/US3/US6).
// It loads the batched builder read model and owns assignment mutations.
function EventBuilderRoute() {
  const { ministryId, cycleId } = Route.useParams();
  const router = useRouter();
  const {
    data,
    publish,
    sendUpdates,
    query,
    createAssignment,
    deleteAssignment,
    reassignAssignment,
    moveAssignment,
  } = useCycleBuilder({ cycleId, ministryId });

  const status =
    query.isError && isAxiosError(query.error)
      ? query.error.response?.status
      : undefined;
  const navigate = Route.useNavigate();
  useEffect(() => {
    if (status === 401) {
      const { href } = router.state.location;
      void navigate({
        to: '/login',
        search: { redirect: href },
        replace: true,
      });
    }
    if (status === 403) void navigate({ to: '/no-access', replace: true });
  }, [status, navigate, router]);

  if (query.isError) {
    if (status === 401 || status === 403) return null;
    if (status === 404) throw notFound();
    throw query.error;
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
        isSendingUpdates={sendUpdates.isPending}
        onSendUpdates={() => sendUpdates.mutate()}
        onPublish={(confirmBelowFull) => publish.mutate(confirmBelowFull)}
        createAssignment={createAssignment}
        deleteAssignment={deleteAssignment}
        reassignAssignment={reassignAssignment}
        moveAssignment={moveAssignment}
        syncedAt={query.dataUpdatedAt}
        isRefreshing={query.isFetching}
      />
    </div>
  );
}
