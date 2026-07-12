import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import {
  buildCycleOptions,
  classifyTailoringFetchError,
} from '@/features/scheduling/components/participation-tailoring.utils';
import { MinistryCycleList } from '@/features/scheduling/components/tailoring/ministry-cycle-list';
import { adminApi } from '@/utils/api-instances';

export const Route = createFileRoute('/scheduling/tailoring/$ministryId/')({
  component: TailoringMinistryCycleListRoute,
});

function TailoringMinistryCycleListRoute() {
  const { ministryId } = Route.useParams();
  const navigate = Route.useNavigate();

  const eventsQuery = useQuery({
    queryKey: ['tailoring-events', ministryId],
    queryFn: () => adminApi.listEvents({ ministryId }),
    retry: false,
  });

  const lockedCyclesQuery = useQuery({
    queryKey: ['tailoring-locked-cycles'],
    queryFn: () => adminApi.listPlanningCycles({ state: 'locked' }),
    retry: false,
  });

  const lockedCycleIdSet = new Set(
    (lockedCyclesQuery.data?.cycles ?? []).map((cycle) => cycle.id),
  );
  const events = (eventsQuery.data?.events ?? []).filter((event) =>
    lockedCycleIdSet.has(event.planningCycleId),
  );
  const cycleOptions = buildCycleOptions(events);

  const isLoading = eventsQuery.isLoading || lockedCyclesQuery.isLoading;
  const isReady = eventsQuery.isSuccess && lockedCyclesQuery.isSuccess;

  useEffect(() => {
    if (!isReady || cycleOptions.length !== 1) return;
    const onlyCycle = cycleOptions[0];
    if (!onlyCycle) return;

    navigate({
      to: '/scheduling/tailoring/$ministryId/$cycleId',
      params: { ministryId, cycleId: onlyCycle.id },
      replace: true,
    });
  }, [isReady, cycleOptions, ministryId, navigate]);

  const failedQuery = [eventsQuery, lockedCyclesQuery].find(
    (query) => query.isError,
  );
  const errorKind = failedQuery
    ? classifyTailoringFetchError({ error: failedQuery.error })
    : null;

  const retryAll = () => {
    eventsQuery.refetch();
    lockedCyclesQuery.refetch();
  };

  return (
    <WorkspacePage data-testid="tailoring-cycle-list-page">
      <WorkspaceIntroPanel
        title="Cycles"
        description="Pick a locked cycle to tailor for this ministry."
        autoFocusTitle
      />

      {errorKind === 'forbidden' ? (
        <Alert variant="destructive" data-testid="tailoring-forbidden-state">
          <AlertTitle>You don't have access to this ministry</AlertTitle>
          <AlertDescription>
            Ask a church admin to grant you leader or sub-leader access.
          </AlertDescription>
        </Alert>
      ) : errorKind === 'retryable' ? (
        <Alert
          variant="destructive"
          data-testid="tailoring-retryable-error-state"
        >
          <AlertTitle>Couldn't load cycles</AlertTitle>
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
      ) : isLoading || cycleOptions.length === 1 ? (
        <div className="grid gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <MinistryCycleList
          cycles={cycleOptions}
          onSelectCycle={({ cycleId }) =>
            navigate({
              to: '/scheduling/tailoring/$ministryId/$cycleId',
              params: { ministryId, cycleId },
            })
          }
        />
      )}
    </WorkspacePage>
  );
}
