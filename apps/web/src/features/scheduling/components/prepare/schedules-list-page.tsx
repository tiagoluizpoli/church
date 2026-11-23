import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { HeaderStatChip } from '@/components/header-stat-chip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pending } from '@/components/ui/pending';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { formatCycleDateRange } from '@/features/scheduling/components/builder/cycle-builder-header';
import { ScheduleStatus } from '@/features/scheduling/components/prepare/schedule-rows';
import {
  type ScheduleFilters,
  useScheduleList,
} from '@/features/scheduling/hooks/use-schedule';
import {
  type ListSchedules200Options,
  type ListSchedules200SchedulesItem,
  ListSchedulesPeriod,
  ListSchedulesStage,
} from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';

const ANY = 'any';
const ATTENTION = 'attention';

function stageName(stage: ListSchedulesStage): string {
  switch (stage) {
    case 'to_prepare':
      return m.schedules_to_prepare();
    case 'asking':
      return m.schedules_asking_stage();
    case 'assigning':
      return m.schedules_assigning();
    case 'published':
      return m.schedules_published();
    case 'not_serving':
      return m.schedules_not_serving();
  }
}

function periodName(period: ListSchedulesPeriod): string {
  return {
    current: m.schedules_period_current(),
    past: m.schedules_past(),
    all: m.schedules_period_all(),
  }[period];
}

function titleOf(row: ListSchedules200SchedulesItem): string {
  return `${row.ministry.name} · ${row.cycle.name}`;
}

function rowIdOf(row: ListSchedules200SchedulesItem): string {
  return `${row.ministry.id}:${row.cycle.id}`;
}

function CycleCell({ cycle }: ListSchedules200SchedulesItem) {
  const range = formatCycleDateRange(cycle);
  return (
    <span className="flex items-baseline gap-2">
      {cycle.name}
      {range ? (
        <span className="text-muted-foreground text-xs">{range}</span>
      ) : null}
    </span>
  );
}

function OpenAction(row: ListSchedules200SchedulesItem) {
  return (
    <Link
      to="/app/schedules/$ministryId/$cycleId"
      params={{ ministryId: row.ministry.id, cycleId: row.cycle.id }}
      aria-label={m.schedules_open_label({ name: titleOf(row) })}
      className={buttonVariants({
        variant: 'outline',
        size: 'xs',
        className: 'min-h-11 min-w-11 md:min-h-0 md:min-w-0',
      })}
    >
      {m.schedules_open()}
    </Link>
  );
}

interface FilterBarProps {
  filters: ScheduleFilters;
  options?: ListSchedules200Options;
  onChange: (filters: ScheduleFilters) => void;
}

function FilterBar({ filters, options, onChange }: FilterBarProps) {
  const { isChurchAdmin } = useCallerCapabilities();
  const committed = filters.search ?? '';
  const { search, setSearch, commitNow } = useDebouncedSearch({
    committed,
    onCommit: (commit) => onChange({ ...filters, ...commit }),
  });
  const ministries = options?.ministries ?? [];
  const ministryId = filters.ministryId ?? ANY;
  const stage = filters.attention ? ATTENTION : (filters.stage ?? ANY);
  const period = filters.period ?? 'current';
  return (
    <form
      aria-label={m.schedules_filters_label()}
      className="flex flex-col gap-3 md:flex-row md:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        commitNow();
      }}
    >
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <Label htmlFor="schedules-filter-search">
          {m.schedules_filter_search()}
        </Label>
        <Input
          id="schedules-filter-search"
          type="search"
          value={search}
          maxLength={100}
          onChange={(event) => setSearch(event.target.value)}
          className="min-h-11 md:min-h-0"
        />
      </div>
      {isChurchAdmin || ministries.length > 1 ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="schedules-filter-ministry">
            {m.schedules_filter()}
          </Label>
          <Select
            value={ministryId}
            onValueChange={(value) =>
              onChange({
                ...filters,
                ministryId: !value || value === ANY ? undefined : value,
              })
            }
          >
            <SelectTrigger
              id="schedules-filter-ministry"
              className="min-h-11 w-full md:min-h-0 md:w-48"
            >
              <SelectValue>
                {ministries.find((ministry) => ministry.id === ministryId)
                  ?.name ?? m.schedules_all_ministries()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>
                {m.schedules_all_ministries()}
              </SelectItem>
              {ministries.map((ministry) => (
                <SelectItem key={ministry.id} value={ministry.id}>
                  {ministry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor="schedules-filter-status">
          {m.schedules_filter_status()}
        </Label>
        <Select
          value={stage}
          onValueChange={(value) =>
            onChange({
              ...filters,
              attention: value === ATTENTION || undefined,
              stage:
                !value || value === ANY || value === ATTENTION
                  ? undefined
                  : (value as ListSchedulesStage),
            })
          }
        >
          <SelectTrigger
            id="schedules-filter-status"
            className="min-h-11 w-full md:min-h-0 md:w-48"
          >
            <SelectValue>
              {stage === ANY
                ? m.schedules_filter_any_status()
                : stage === ATTENTION
                  ? m.schedules_filter_needs_attention()
                  : stageName(stage)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>
              {m.schedules_filter_any_status()}
            </SelectItem>
            <SelectItem value={ATTENTION}>
              {m.schedules_filter_needs_attention()}
            </SelectItem>
            {Object.values(ListSchedulesStage).map((value) => (
              <SelectItem key={value} value={value}>
                {stageName(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="schedules-filter-period">
          {m.schedules_filter_period()}
        </Label>
        <Select
          value={period}
          onValueChange={(value) =>
            onChange({
              ...filters,
              period: (value as ListSchedulesPeriod | null) ?? undefined,
            })
          }
        >
          <SelectTrigger
            id="schedules-filter-period"
            className="min-h-11 w-full md:min-h-0 md:w-40"
          >
            <SelectValue>{periodName(period)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.values(ListSchedulesPeriod).map((value) => (
              <SelectItem key={value} value={value}>
                {periodName(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </form>
  );
}

interface SchedulesListPageProps {
  filters: ScheduleFilters;
  onFiltersChange: (filters: ScheduleFilters) => void;
}

/** The caller's Schedules in server order: actionable stages first, Past behind the Period filter. */
export function SchedulesListPage({
  filters,
  onFiltersChange,
}: SchedulesListPageProps) {
  const query = useScheduleList({ filters });
  const data =
    query.isError && !query.isFetchNextPageError ? undefined : query.data;
  const rows = data?.pages.flatMap((page) => page.schedules) ?? [];
  const counts = data?.pages[0]?.counts;
  const options = data?.pages[0]?.options;
  const errorStatus = isAxiosError(query.error)
    ? query.error.response?.status
    : undefined;
  const isFiltered = Boolean(
    filters.search || filters.ministryId || filters.stage || filters.attention,
  );
  const period = filters.period ?? 'current';
  // A new filter set shows the previous rows only as placeholder data.
  const loading = query.isLoading || query.isPlaceholderData;
  // The server defaults to current, so the default period stays off the request.
  const change = (next: ScheduleFilters) =>
    onFiltersChange({
      ...next,
      period: next.period === 'current' ? undefined : next.period,
    });

  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title={m.schedules_title()}
        description={m.schedules_description()}
        autoFocusTitle
        aside={
          counts ? (
            <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
              <HeaderStatChip
                testId="schedules-to-prepare-chip"
                label={m.schedules_to_prepare()}
                value={counts.to_prepare}
              />
              <HeaderStatChip
                testId="schedules-asking-chip"
                label={m.schedules_asking_stage()}
                value={counts.asking}
              />
              <HeaderStatChip
                testId="schedules-assigning-chip"
                label={m.schedules_assigning()}
                value={counts.assigning}
              />
              <HeaderStatChip
                testId="schedules-published-chip"
                label={m.schedules_stat_published()}
                value={counts.published}
              />
            </div>
          ) : undefined
        }
      />
      {query.isError && rows.length === 0 ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center gap-3">
            {errorStatus === 403 ? (
              m.shell_no_access()
            ) : errorStatus === 404 ? (
              m.error_not_found()
            ) : (
              <>
                <span>{m.schedules_error()}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 md:min-h-0"
                  onClick={() => query.refetch()}
                >
                  {m.schedules_retry()}
                </Button>
              </>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <FilterBar filters={filters} options={options} onChange={change} />
          {loading ? (
            <Card className="surface-panel">
              <CardContent>
                <Pending
                  label={m.schedules_loading()}
                  className="grid gap-3 md:gap-0"
                >
                  <Skeleton className="hidden h-[41px] w-full md:block" />
                  {[0, 1, 2].map((row) => (
                    <Skeleton
                      key={row}
                      className="h-20 w-full md:mt-px md:h-[48px]"
                    />
                  ))}
                </Pending>
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <div className="space-y-2" role="status">
              <p className="text-muted-foreground">
                {isFiltered || period !== 'current'
                  ? m.schedules_empty_filtered()
                  : m.schedules_empty()}
              </p>
              {isFiltered ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 md:min-h-0"
                  onClick={() => change({ period: filters.period })}
                >
                  {m.invitations_clear_filters()}
                </Button>
              ) : null}
            </div>
          ) : (
            <Card className="surface-panel">
              <CardContent className="space-y-3">
                <DataTable<ListSchedules200SchedulesItem>
                  aria-label={m.schedules_title()}
                  columns={[
                    {
                      id: 'ministry',
                      name: m.schedules_filter(),
                      isRowHeader: true,
                    },
                    { id: 'cycle', name: m.schedules_column_cycle() },
                    { id: 'status', name: m.schedules_filter_status() },
                    { id: 'actions', name: m.people_column_actions() },
                  ]}
                  items={rows}
                  rowId={({ item }) => rowIdOf(item)}
                  renderCell={({ item, column }) => {
                    switch (column.id) {
                      case 'ministry':
                        return (
                          <span className="font-medium">
                            {item.ministry.name}
                          </span>
                        );
                      case 'cycle':
                        return <CycleCell {...item} />;
                      case 'status':
                        return (
                          <ScheduleStatus row={item} showOutstanding={false} />
                        );
                      default:
                        return <OpenAction {...item} />;
                    }
                  }}
                  renderMobileCard={({ item }) => (
                    <div className="surface-subtle workspace-panel flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="min-w-0 flex-1 basis-40 space-y-1">
                        <p className="break-words font-medium">
                          {item.ministry.name}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {item.cycle.name}
                          {formatCycleDateRange(item.cycle)
                            ? ` · ${formatCycleDateRange(item.cycle)}`
                            : ''}
                        </p>
                        <ScheduleStatus row={item} showOutstanding={false} />
                      </div>
                      <div className="ml-auto">
                        <OpenAction {...item} />
                      </div>
                    </div>
                  )}
                />
                {query.isFetchNextPageError ? (
                  <Alert variant="destructive">
                    <AlertDescription className="flex items-center gap-3">
                      <span>{m.schedules_error()}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11 md:min-h-0"
                        onClick={() => query.fetchNextPage()}
                      >
                        {m.schedules_retry()}
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : null}
                {query.hasNextPage && !query.isFetchNextPageError ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={query.isFetchingNextPage}
                    className="min-h-11 w-full md:min-h-0 md:w-auto"
                    onClick={() => query.fetchNextPage()}
                  >
                    {query.isFetchingNextPage
                      ? m.invitations_loading_more()
                      : m.invitations_load_more()}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </WorkspacePage>
  );
}
