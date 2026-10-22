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
  buildMinistryPrepareSummary,
  classifyPrepareFetchError,
  toScheduleKey,
} from '@/features/scheduling/components/participation-prepare.utils';
import { MinistryPrepareList } from '@/features/scheduling/components/prepare/ministry-prepare-list';
import { StatPill } from '@/features/scheduling/components/prepare/stat-pill';
import { adminApi } from '@/utils/api-instances';

interface CycleIdRef {
  cycleId: string;
}

export const Route = createFileRoute(
  '/_authenticated/_active-church/schedules/',
)({
  component: PrepareMinistryListRoute,
});

function PrepareMinistryListRoute() {
  const navigate = Route.useNavigate();

  const ministriesQuery = useQuery({
    queryKey: ['prepare-ministries'],
    queryFn: () => adminApi.listMinistries(),
    retry: false,
  });
  const ministries = ministriesQuery.data?.ministries ?? [];

  const sentCyclesQuery = useQuery({
    queryKey: ['prepare-sent-cycles'],
    queryFn: () => adminApi.listCycles({ state: 'sent' }),
    retry: false,
  });
  const sentCycleIds = (sentCyclesQuery.data?.cycles ?? []).map(
    (cycle) => cycle.id,
  );

  const eventsQueries = useQueries({
    queries: ministries.map((ministry) => ({
      queryKey: ['prepare-events', ministry.id],
      queryFn: () => adminApi.listEvents({ ministryId: ministry.id }),
      enabled: ministriesQuery.isSuccess,
      retry: false,
    })),
  });
  const eventsQueriesSettled =
    ministries.length === eventsQueries.length &&
    eventsQueries.every((query) => query.isSuccess);

  const eventsByMinistryId: Record<string, CycleIdRef[] | undefined> = {};
  ministries.forEach((ministry, index) => {
    eventsByMinistryId[ministry.id] = eventsQueries[index]?.data?.events;
  });

  const sentCycleIdSet = new Set(sentCycleIds);
  const relevantPairs = eventsQueriesSettled
    ? ministries.flatMap((ministry) => {
        const events = eventsByMinistryId[ministry.id] ?? [];
        const cycleIds = new Set(
          events
            .map((event) => event.cycleId)
            .filter((cycleId) => sentCycleIdSet.has(cycleId)),
        );
        return [...cycleIds].map((cycleId) => ({
          ministryId: ministry.id,
          cycleId,
        }));
      })
    : [];

  const participationQueries = useQueries({
    queries: relevantPairs.map(({ ministryId, cycleId }) => ({
      queryKey: ['prepare-cycle-participation-summary', ministryId, cycleId],
      queryFn: () => adminApi.getCycleParticipation(cycleId, { ministryId }),
      enabled: eventsQueriesSettled && sentCyclesQuery.isSuccess,
      retry: false,
    })),
  });

  const eventTimeBlockCountByMinistryAndCycle: Record<string, number> = {};
  relevantPairs.forEach(({ ministryId, cycleId }, index) => {
    const events = participationQueries[index]?.data?.events ?? [];
    eventTimeBlockCountByMinistryAndCycle[
      toScheduleKey({ ministryId, cycleId })
    ] = events.reduce(
      (total, eventView) => total + eventView.eventTimeBlocks.length,
      0,
    );
  });

  const isLoading =
    ministriesQuery.isLoading ||
    sentCyclesQuery.isLoading ||
    eventsQueries.some((query) => query.isLoading) ||
    participationQueries.some((query) => query.isLoading);

  const allQueries = [
    ministriesQuery,
    sentCyclesQuery,
    ...eventsQueries,
    ...participationQueries,
  ];
  const failedQuery = allQueries.find((query) => query.isError);
  const errorKind = failedQuery
    ? classifyPrepareFetchError({ error: failedQuery.error })
    : null;

  const retryAll = () => {
    ministriesQuery.refetch();
    sentCyclesQuery.refetch();
    for (const query of eventsQueries) query.refetch();
    for (const query of participationQueries) query.refetch();
  };

  const rows = buildMinistryPrepareSummary({
    ministries,
    sentCycleIds,
    eventsByMinistryId,
    eventTimeBlockCountByMinistryAndCycle,
  });
  const eventTotal = rows.reduce((total, row) => total + row.eventCount, 0);
  const eventTimeBlockTotal = rows.reduce(
    (total, row) => total + row.eventTimeBlockCount,
    0,
  );
  const showList = !isLoading && !errorKind;

  return (
    <WorkspacePage data-testid="prepare-ministry-list-page">
      <WorkspaceIntroPanel
        title="Pick a ministry"
        description="Choose a ministry to start preparing. Next you'll pick a cycle to work in."
        autoFocusTitle
        aside={
          showList ? (
            <div className="flex flex-wrap gap-2">
              <StatPill
                label="Ministries"
                value={rows.length}
                testId="prepare-ministry-count"
              />
              <StatPill
                label="Events"
                value={eventTotal}
                testId="prepare-ministry-event-total"
              />
              <StatPill
                label="Time blocks"
                value={eventTimeBlockTotal}
                testId="prepare-ministry-event-time-block-total"
              />
            </div>
          ) : null
        }
      />

      {errorKind === 'forbidden' ? (
        <Alert variant="destructive" data-testid="prepare-forbidden-state">
          <AlertTitle>You don't have access to this ministry list</AlertTitle>
          <AlertDescription>
            Ask a church admin to grant you leader or sub-leader access.
          </AlertDescription>
        </Alert>
      ) : errorKind === 'retryable' ? (
        <Alert
          variant="destructive"
          data-testid="prepare-retryable-error-state"
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
        <MinistryPrepareList
          rows={rows}
          onSelectMinistry={({ ministryId }) =>
            navigate({
              to: '/schedules/$ministryId',
              params: { ministryId },
            })
          }
        />
      )}
    </WorkspacePage>
  );
}
