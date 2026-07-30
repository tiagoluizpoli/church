import { useQueries, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import {
  buildMinistryTailoringSummary,
  classifyTailoringFetchError,
  toMinistryCycleKey,
} from '@/features/scheduling/components/participation-tailoring.utils';
import { MinistryTailoringList } from '@/features/scheduling/components/tailoring/ministry-tailoring-list';
import { StatPill } from '@/features/scheduling/components/tailoring/stat-pill';
import { adminApi } from '@/utils/api-instances';

export const Route = createFileRoute(
  '/_authenticated/_active-church/scheduling/tailoring/',
)({
  component: TailoringMinistryListRoute,
});

function TailoringMinistryListRoute() {
  const navigate = Route.useNavigate();

  const ministriesQuery = useQuery({
    queryKey: ['tailoring-ministries'],
    queryFn: () => adminApi.listMinistries(),
    retry: false,
  });
  const ministries = ministriesQuery.data?.ministries ?? [];

  const lockedCyclesQuery = useQuery({
    queryKey: ['tailoring-locked-cycles'],
    queryFn: () => adminApi.listPlanningCycles({ state: 'locked' }),
    retry: false,
  });
  const lockedCycleIds = (lockedCyclesQuery.data?.cycles ?? []).map(
    (cycle) => cycle.id,
  );

  const eventsQueries = useQueries({
    queries: ministries.map((ministry) => ({
      queryKey: ['tailoring-events', ministry.id],
      queryFn: () => adminApi.listEvents({ ministryId: ministry.id }),
      enabled: ministriesQuery.isSuccess,
      retry: false,
    })),
  });
  const eventsQueriesSettled =
    ministries.length === eventsQueries.length &&
    eventsQueries.every((query) => query.isSuccess);

  const eventsByMinistryId: Record<
    string,
    { planningCycleId: string }[] | undefined
  > = {};
  ministries.forEach((ministry, index) => {
    eventsByMinistryId[ministry.id] = eventsQueries[index]?.data?.events;
  });

  const lockedCycleIdSet = new Set(lockedCycleIds);
  const relevantPairs = eventsQueriesSettled
    ? ministries.flatMap((ministry) => {
        const events = eventsByMinistryId[ministry.id] ?? [];
        const cycleIds = new Set(
          events
            .map((event) => event.planningCycleId)
            .filter((cycleId) => lockedCycleIdSet.has(cycleId)),
        );
        return [...cycleIds].map((cycleId) => ({
          ministryId: ministry.id,
          cycleId,
        }));
      })
    : [];

  const participationQueries = useQueries({
    queries: relevantPairs.map(({ ministryId, cycleId }) => ({
      queryKey: ['tailoring-cycle-participation-summary', ministryId, cycleId],
      queryFn: () => adminApi.getCycleParticipation(cycleId, { ministryId }),
      enabled: eventsQueriesSettled && lockedCyclesQuery.isSuccess,
      retry: false,
    })),
  });

  const slotCountByMinistryAndCycle: Record<string, number> = {};
  relevantPairs.forEach(({ ministryId, cycleId }, index) => {
    const events = participationQueries[index]?.data?.events ?? [];
    slotCountByMinistryAndCycle[toMinistryCycleKey({ ministryId, cycleId })] =
      events.reduce((total, eventView) => total + eventView.slots.length, 0);
  });

  const isLoading =
    ministriesQuery.isLoading ||
    lockedCyclesQuery.isLoading ||
    eventsQueries.some((query) => query.isLoading) ||
    participationQueries.some((query) => query.isLoading);

  const allQueries = [
    ministriesQuery,
    lockedCyclesQuery,
    ...eventsQueries,
    ...participationQueries,
  ];
  const failedQuery = allQueries.find((query) => query.isError);
  const errorKind = failedQuery
    ? classifyTailoringFetchError({ error: failedQuery.error })
    : null;

  const retryAll = () => {
    ministriesQuery.refetch();
    lockedCyclesQuery.refetch();
    for (const query of eventsQueries) query.refetch();
    for (const query of participationQueries) query.refetch();
  };

  const rows = buildMinistryTailoringSummary({
    ministries,
    lockedCycleIds,
    eventsByMinistryId,
    slotCountByMinistryAndCycle,
  });
  const eventTotal = rows.reduce((total, row) => total + row.eventCount, 0);
  const slotTotal = rows.reduce((total, row) => total + row.slotCount, 0);
  const showList = !isLoading && !errorKind;

  return (
    <WorkspacePage data-testid="tailoring-ministry-list-page">
      <WorkspaceIntroPanel
        title="Pick a ministry"
        description="Choose a ministry to start rostering. Next you'll pick a cycle to work in."
        autoFocusTitle
        aside={
          showList ? (
            <div className="flex flex-wrap gap-2">
              <StatPill
                label="Ministries"
                value={rows.length}
                testId="tailoring-ministry-count"
              />
              <StatPill
                label="Events"
                value={eventTotal}
                testId="tailoring-ministry-event-total"
              />
              <StatPill
                label="Slots"
                value={slotTotal}
                testId="tailoring-ministry-slot-total"
              />
            </div>
          ) : null
        }
      />

      {errorKind === 'forbidden' ? (
        <Alert variant="destructive" data-testid="tailoring-forbidden-state">
          <AlertTitle>You don't have access to this ministry list</AlertTitle>
          <AlertDescription>
            Ask a church admin to grant you leader or sub-leader access.
          </AlertDescription>
        </Alert>
      ) : errorKind === 'retryable' ? (
        <Alert
          variant="destructive"
          data-testid="tailoring-retryable-error-state"
        >
          <AlertTitle>Couldn't load ministries</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>Check your connection and try again.</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={retryAll}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <MinistryTailoringList
          rows={rows}
          onSelectMinistry={({ ministryId }) =>
            navigate({
              to: '/scheduling/tailoring/$ministryId',
              params: { ministryId },
            })
          }
        />
      )}
    </WorkspacePage>
  );
}
