import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { classifyTailoringFetchError } from '@/features/scheduling/components/participation-tailoring.utils';
import {
  buildMinistryCycleSummaries,
  filterCycleSummaries,
} from '@/features/scheduling/components/tailoring/cycle-list.utils';
import {
  type CycleListFilters,
  CycleListFiltersBar,
  DEFAULT_FILTERS,
} from '@/features/scheduling/components/tailoring/cycle-list-filters-bar';
import { MinistryCycleList } from '@/features/scheduling/components/tailoring/ministry-cycle-list';
import { StatPill } from '@/features/scheduling/components/tailoring/stat-pill';
import { adminApi } from '@/utils/api-instances';

const cycleListSearchSchema = z.object({
  browse: z.boolean().optional(),
  dateMode: z.enum(['starts', 'ends', 'within']).optional(),
  dateStart: z.string().optional(),
  dateEnd: z.string().optional(),
  involvement: z.enum(['all', 'part_of', 'not_part_of']).optional(),
  status: z.enum(['all', 'not_started', 'in_progress', 'published']).optional(),
});

export const Route = createFileRoute(
  '/_authenticated/_active-church/scheduling/tailoring/$ministryId/',
)({
  validateSearch: (search) => cycleListSearchSchema.parse(search),
  component: TailoringMinistryCycleListRoute,
});

function TailoringMinistryCycleListRoute() {
  const { ministryId } = Route.useParams();
  const search = Route.useSearch();
  const { browse } = search;
  const navigate = Route.useNavigate();

  const filters: CycleListFilters = useMemo(
    () => ({
      dateMode: search.dateMode ?? DEFAULT_FILTERS.dateMode,
      dateStart: search.dateStart ?? DEFAULT_FILTERS.dateStart,
      dateEnd: search.dateEnd ?? DEFAULT_FILTERS.dateEnd,
      involvement: search.involvement ?? DEFAULT_FILTERS.involvement,
      status: search.status ?? DEFAULT_FILTERS.status,
    }),
    [
      search.dateMode,
      search.dateStart,
      search.dateEnd,
      search.involvement,
      search.status,
    ],
  );

  const setFilters = (next: CycleListFilters) => {
    navigate({
      search: (prev) => ({
        ...prev,
        dateMode:
          next.dateMode === DEFAULT_FILTERS.dateMode
            ? undefined
            : next.dateMode,
        dateStart: next.dateStart || undefined,
        dateEnd: next.dateEnd || undefined,
        involvement: next.involvement === 'all' ? undefined : next.involvement,
        status: next.status === 'all' ? undefined : next.status,
      }),
      replace: true,
    });
  };

  const cycleSummariesQuery = useQuery({
    queryKey: ['tailoring-cycle-summaries', ministryId],
    queryFn: () => adminApi.listMinistryCycleSummaries(ministryId),
    retry: false,
  });
  const ministriesQuery = useQuery({
    queryKey: ['tailoring-ministries'],
    queryFn: () => adminApi.listMinistries(),
    retry: false,
  });
  const ministryName = ministriesQuery.data?.ministries.find(
    (ministry) => ministry.id === ministryId,
  )?.name;

  const isLoading = cycleSummariesQuery.isLoading || ministriesQuery.isLoading;
  const isReady = cycleSummariesQuery.isSuccess;

  const allCycles = useMemo(
    () =>
      buildMinistryCycleSummaries({
        cycles: cycleSummariesQuery.data?.cycles ?? [],
      }),
    [cycleSummariesQuery.data],
  );
  const partOfCycles = useMemo(
    () => allCycles.filter((cycle) => cycle.isPartOf),
    [allCycles],
  );
  const filteredCycles = useMemo(
    () =>
      filterCycleSummaries({
        cycles: allCycles,
        filter: {
          dateRange: {
            mode: filters.dateMode,
            start: filters.dateStart || undefined,
            end: filters.dateEnd || undefined,
          },
          involvement: filters.involvement,
          status: filters.status,
        },
      }),
    [allCycles, filters],
  );

  useEffect(() => {
    if (!isReady || browse || partOfCycles.length !== 1) return;
    const onlyCycle = partOfCycles[0];
    if (!onlyCycle) return;

    navigate({
      to: '/scheduling/tailoring/$ministryId/$cycleId',
      params: { ministryId, cycleId: onlyCycle.id },
      replace: true,
    });
  }, [isReady, browse, partOfCycles, ministryId, navigate]);

  const failedQuery = [cycleSummariesQuery, ministriesQuery].find(
    (query) => query.isError,
  );
  const errorKind = failedQuery
    ? classifyTailoringFetchError({ error: failedQuery.error })
    : null;

  const retryAll = () => {
    cycleSummariesQuery.refetch();
    ministriesQuery.refetch();
  };

  const isRedirecting = isReady && !browse && partOfCycles.length === 1;
  const showList = !isLoading && !errorKind && !isRedirecting;

  const eventTotal = useMemo(
    () => filteredCycles.reduce((sum, cycle) => sum + cycle.eventCount, 0),
    [filteredCycles],
  );
  const slotTotal = useMemo(
    () => filteredCycles.reduce((sum, cycle) => sum + cycle.slotCount, 0),
    [filteredCycles],
  );

  return (
    <WorkspacePage data-testid="tailoring-cycle-list-page">
      <WorkspaceIntroPanel
        title="Cycles"
        description="Pick a cycle to start rostering for this ministry."
        autoFocusTitle
        aside={
          showList ? (
            <div className="flex flex-wrap gap-2">
              {ministryName ? (
                <StatPill
                  label="Ministry"
                  value={ministryName}
                  testId="tailoring-cycle-ministry-name"
                />
              ) : null}
              <StatPill
                label="Cycles"
                value={filteredCycles.length}
                testId="tailoring-cycle-count"
              />
              <StatPill
                label="Events"
                value={eventTotal}
                testId="tailoring-cycle-event-total"
              />
              <StatPill
                label="Slots"
                value={slotTotal}
                testId="tailoring-cycle-slot-total"
              />
            </div>
          ) : null
        }
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
      ) : isLoading ? (
        <div className="grid gap-3" data-testid="tailoring-cycle-list-loading">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isRedirecting ? (
        <p
          className="text-muted-foreground text-sm"
          data-testid="tailoring-cycle-list-redirecting"
        >
          This is the only open cycle for this ministry — taking you there now.{' '}
          <Link
            to="/scheduling/tailoring/$ministryId"
            params={{ ministryId }}
            search={{ browse: true }}
            data-testid="tailoring-browse-all-cycles-link"
            className="underline underline-offset-2"
          >
            Browse all cycles instead
          </Link>
        </p>
      ) : (
        <MinistryCycleList
          ministryId={ministryId}
          cycles={filteredCycles}
          filters={
            <CycleListFiltersBar
              appliedFilters={filters}
              onApply={setFilters}
            />
          }
          onSelectCycle={({ cycleId }) =>
            navigate({
              to: '/scheduling/tailoring/$ministryId/$cycleId',
              params: { ministryId, cycleId },
            })
          }
          emptyMessage={
            filteredCycles.length === 0 && allCycles.length > 0
              ? 'No cycles match the current filters. Use "Clear filters" above to reset.'
              : undefined
          }
        />
      )}
    </WorkspacePage>
  );
}
