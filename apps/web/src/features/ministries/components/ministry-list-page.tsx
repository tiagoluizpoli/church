import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { HeaderStatChip } from '@/components/header-stat-chip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
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
import { Spinner } from '@/components/ui/spinner';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { CreateMinistryDialog } from '@/features/ministries/components/create-ministry-dialog';
import {
  type MinistryDirectoryFilters,
  useMinistryDirectory,
} from '@/features/ministries/ministry-queries';
import { cn } from '@/lib/utils';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { pluralMessage } from '@/shared/utils/plural';

interface MinistryRow {
  id: string;
  name: string;
  sectorCount: number;
  roleCount: number;
  needsReview: boolean;
}

type StatusFilter = NonNullable<MinistryDirectoryFilters['status']>;

function ministryColumns(): DataTableColumn[] {
  return [
    { id: 'name', name: m.ministries_name_label(), isRowHeader: true },
    { id: 'sectors', name: m.ministry_tab_sectors() },
    { id: 'roles', name: m.ministry_tab_roles() },
    { id: 'actions', name: m.people_column_actions() },
  ];
}

function sectorCountLabel(ministry: MinistryRow) {
  return pluralMessage({
    count: ministry.sectorCount,
    one: () => m.ministries_sector_count_one(),
    other: () =>
      m.ministries_sector_count_other({ count: ministry.sectorCount }),
  });
}

function roleCountLabel(ministry: MinistryRow) {
  return pluralMessage({
    count: ministry.roleCount,
    one: () => m.ministries_role_count_one(),
    other: () => m.ministries_role_count_other({ count: ministry.roleCount }),
  });
}

const REVIEW_TINT = 'bg-amber-50 dark:bg-amber-950/30';
const ACTION_SIZE = 'min-h-11 min-w-11 md:min-h-0 md:min-w-0';

function MinistryAction({ needsReview, id, name }: MinistryRow) {
  return (
    <div className="flex flex-wrap justify-end gap-2 max-md:ml-auto md:w-full">
      {needsReview ? (
        <Link
          to="/app/ministries/$ministryId/usual-setup"
          params={{ ministryId: id }}
          aria-label={m.ministries_review_label({ name })}
          className={buttonVariants({ size: 'xs', className: ACTION_SIZE })}
        >
          {m.ministries_review()}
        </Link>
      ) : null}
      <Link
        to="/app/ministries/$ministryId"
        params={{ ministryId: id }}
        aria-label={m.ministries_open_label({ name })}
        className={buttonVariants({
          variant: 'outline',
          size: 'xs',
          className: ACTION_SIZE,
        })}
      >
        {m.ministries_open()}
      </Link>
    </div>
  );
}

interface FilterBarProps {
  filters: MinistryDirectoryFilters;
  onChange: (filters: MinistryDirectoryFilters) => void;
}

function statusLabel(status: StatusFilter) {
  if (status === 'review') return m.ministries_filter_review();
  if (status === 'no-sectors') return m.ministries_filter_no_sectors();
  return m.ministries_filter_all();
}

/** Search commits 300 ms after typing stops (or on submit); status commits at once. */
function FilterBar({ filters, onChange }: FilterBarProps) {
  const committed = filters.search ?? '';
  const { search, setSearch, commitNow } = useDebouncedSearch({
    committed,
    onCommit: (commit) => onChange({ ...filters, ...commit }),
  });
  const status = filters.status ?? 'any';
  return (
    <form
      aria-label={m.ministries_filters_label()}
      className="flex flex-col gap-3 md:flex-row md:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        commitNow();
      }}
    >
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <Label htmlFor="ministries-filter-search">
          {m.ministries_name_label()}
        </Label>
        <Input
          id="ministries-filter-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="min-h-11 md:min-h-0"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ministries-filter-status">
          {m.ministries_filter_status()}
        </Label>
        <Select
          value={status}
          onValueChange={(value) =>
            onChange({ ...filters, status: (value as StatusFilter) ?? 'any' })
          }
        >
          <SelectTrigger
            id="ministries-filter-status"
            className="min-h-11 w-full md:min-h-0 md:w-48"
          >
            <SelectValue>{statusLabel(status)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{m.ministries_filter_all()}</SelectItem>
            <SelectItem value="review">
              {m.ministries_filter_review()}
            </SelectItem>
            <SelectItem value="no-sectors">
              {m.ministries_filter_no_sectors()}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </form>
  );
}

interface MinistryListPageProps {
  filters: MinistryDirectoryFilters;
  onFiltersChange: (filters: MinistryDirectoryFilters) => void;
}

/** The caller's active Ministries, filtered, counted and paged by the server; never auto-opens a single row. */
export function MinistryListPage({
  filters,
  onFiltersChange,
}: MinistryListPageProps) {
  const { isChurchAdmin } = useCallerCapabilities();
  const query = useMinistryDirectory({ filters });
  const data =
    query.isError && !query.isFetchNextPageError ? undefined : query.data;
  const ministries = data?.pages.flatMap((page) => page.ministries) ?? [];
  const counts = data?.pages[0]?.counts;
  const isFiltered = Boolean(
    filters.search || (filters.status && filters.status !== 'any'),
  );
  // A new filter set shows the previous rows only as placeholder data.
  const loading = query.isLoading || query.isPlaceholderData;
  // The server defaults to every status, so `any` stays off the URL.
  const change = (next: MinistryDirectoryFilters) =>
    onFiltersChange({
      ...next,
      status: next.status === 'any' ? undefined : next.status,
    });

  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title={m.nav_ministries()}
        description={m.ministries_description()}
        autoFocusTitle
        aside={
          counts ? (
            <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
              <HeaderStatChip
                testId="ministries-total-chip"
                label={m.nav_ministries()}
                value={counts.total}
              />
              <HeaderStatChip
                testId="ministries-review-chip"
                label={m.ministries_filter_review()}
                value={counts.review}
              />
              <HeaderStatChip
                testId="ministries-no-sectors-chip"
                label={m.ministries_filter_no_sectors()}
                value={counts.noSectors}
              />
            </div>
          ) : undefined
        }
      />
      <FilterBar filters={filters} onChange={change} />
      {isChurchAdmin ? (
        <div className="flex justify-end">
          <CreateMinistryDialog />
        </div>
      ) : null}
      {query.isError && !query.isFetchNextPageError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center gap-3">
            <span>{m.ministries_load_failed()}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => query.refetch()}
            >
              {m.ministries_retry()}
            </Button>
          </AlertDescription>
        </Alert>
      ) : loading ? (
        <Pending label={m.ministries_loading()} className="grid gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </Pending>
      ) : ministries.length === 0 ? (
        <div className="space-y-2" role="status">
          <p className="text-muted-foreground">
            {isFiltered ? m.ministries_empty_filtered() : m.ministries_empty()}
          </p>
          {isFiltered ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 md:min-h-0"
              onClick={() => change({})}
            >
              {m.invitations_clear_filters()}
            </Button>
          ) : null}
        </div>
      ) : (
        <Card className="surface-panel">
          <CardContent>
            <DataTable<MinistryRow>
              aria-label={m.nav_ministries()}
              columns={ministryColumns()}
              items={ministries}
              rowId={({ item }) => item.id}
              rowClassName={({ item }) =>
                item.needsReview ? REVIEW_TINT : undefined
              }
              renderCell={({ item, column }) => {
                switch (column.id) {
                  case 'name':
                    return item.name;
                  case 'sectors':
                    return item.sectorCount;
                  case 'roles':
                    return item.roleCount;
                  default:
                    return <MinistryAction {...item} />;
                }
              }}
              renderMobileCard={({ item }) => (
                <div
                  className={cn(
                    'surface-subtle workspace-panel flex flex-wrap items-center gap-x-3 gap-y-2',
                    item.needsReview && REVIEW_TINT,
                  )}
                >
                  <div className="min-w-0 flex-1 basis-40 space-y-0.5">
                    <p className="break-words font-medium">{item.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {item.sectorCount === 0
                        ? m.ministries_no_sectors()
                        : m.ministries_counts_summary({
                            sectors: sectorCountLabel(item),
                            roles: roleCountLabel(item),
                          })}
                    </p>
                  </div>
                  <MinistryAction {...item} />
                </div>
              )}
            />
            {query.isFetchNextPageError ? (
              <Alert variant="destructive">
                <AlertDescription className="flex items-center gap-3">
                  <span>{m.ministries_load_failed()}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11 md:min-h-0"
                    onClick={() => query.fetchNextPage()}
                  >
                    {m.ministries_retry()}
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
                {query.isFetchingNextPage ? <Spinner /> : null}
                {query.isFetchingNextPage
                  ? m.invitations_loading_more()
                  : m.invitations_load_more()}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}
    </WorkspacePage>
  );
}
