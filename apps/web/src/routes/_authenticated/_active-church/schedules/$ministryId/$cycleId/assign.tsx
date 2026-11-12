import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  DefaultGlobalNotFound,
  notFound,
  useRouter,
} from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Skeleton } from '@/components/ui/skeleton';
import { CycleBuilder } from '@/features/scheduling/components/builder/cycle-builder';
import { useCycleBuilder } from '@/features/scheduling/hooks/use-cycle-builder';
import { adminApi } from '@/utils/api-instances';

/** The id an N7 swap request alert (bell or email) deep-links with. */
const assignSearchSchema = z.object({ swapRequest: z.string().optional() });

export const Route = createFileRoute(
  '/_authenticated/_active-church/schedules/$ministryId/$cycleId/assign',
)({
  validateSearch: assignSearchSchema,
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
  const { swapRequest: linkedSwapRequestId } = Route.useSearch();
  const swapRequestList = useQuery({
    queryKey: ['ministry-swap-requests', ministryId, cycleId],
    queryFn: () => adminApi.listMinistrySwapRequests(ministryId, { cycleId }),
    retry: false,
  });
  const swapRequests = useMemo(
    () => swapRequestList.data?.schedules.flatMap(({ requests }) => requests),
    [swapRequestList.data],
  );
  const [selectedSwapRequestId, setSelectedSwapRequestId] = useState<string>();
  // Open the linked request only once the list has settled, so a slow list
  // never reads as an unknown id. A stale id leaves the board with a message.
  const listSettled = !swapRequestList.isPending;
  useEffect(() => {
    if (!linkedSwapRequestId || !listSettled) return;
    const known = swapRequestList.data?.schedules.some(({ requests }) =>
      requests.some(({ id }) => id === linkedSwapRequestId),
    );
    if (known) {
      setSelectedSwapRequestId(linkedSwapRequestId);
    } else {
      toast.error(m.swap_board_unavailable());
    }
    void navigate({ search: {}, replace: true });
  }, [linkedSwapRequestId, listSettled, swapRequestList.data, navigate]);
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
        swapRequests={swapRequests}
        selectedSwapRequestId={selectedSwapRequestId}
        onSelectSwapRequest={setSelectedSwapRequestId}
      />
    </div>
  );
}
