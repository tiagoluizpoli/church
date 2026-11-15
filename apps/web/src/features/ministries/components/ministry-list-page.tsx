import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { HeaderStatChip } from '@/components/header-stat-chip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { CreateMinistryDialog } from '@/features/ministries/components/create-ministry-dialog';
import { useMinistryList } from '@/features/ministries/ministry-queries';
import { cn } from '@/lib/utils';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';
import { pluralMessage } from '@/shared/utils/plural';

interface MinistryRow {
  id: string;
  name: string;
  sectorCount: number;
  roleCount: number;
  needsReview: boolean;
}

type StatusFilter = 'any' | 'review' | 'no-sectors';

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

/** Under the name only for a Ministry with no Sectors; needs-review shows as the row tint and a Revisar action. */
function MinistryNotice({ sectorCount }: MinistryRow) {
  if (sectorCount === 0) {
    return (
      <span className="block text-muted-foreground text-xs">
        {m.ministries_no_sectors()}
      </span>
    );
  }
  return null;
}

const REVIEW_TINT = 'bg-amber-50 dark:bg-amber-950/30';
const ACTION_SIZE = 'min-h-11 min-w-11 md:min-h-0 md:min-w-0';

function MinistryAction({ needsReview, id, name }: MinistryRow) {
  return (
    <div className="flex flex-wrap justify-end gap-2 max-md:ml-auto md:w-full">
      {needsReview ? (
        <Link
          to="/ministries/$ministryId/usual-setup"
          params={{ ministryId: id }}
          aria-label={m.ministries_review_label({ name })}
          className={buttonVariants({ size: 'xs', className: ACTION_SIZE })}
        >
          {m.ministries_review()}
        </Link>
      ) : null}
      <Link
        to="/ministries/$ministryId"
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

/** The caller's active Ministries, as the server orders them; never auto-opens a single row. */
export function MinistryListPage() {
  const { isChurchAdmin } = useCallerCapabilities();
  const ministriesQuery = useMinistryList({ enabled: true });
  const ministries = ministriesQuery.data?.ministries ?? [];
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('any');
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = ministries.filter(
    (ministry) =>
      ministry.name.toLocaleLowerCase().includes(normalizedSearch) &&
      (status === 'any' ||
        (status === 'review'
          ? ministry.needsReview
          : ministry.sectorCount === 0)),
  );
  const isFiltered = Boolean(normalizedSearch || status !== 'any');

  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title={m.nav_ministries()}
        description={m.ministries_description()}
        autoFocusTitle
        aside={
          <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
            <HeaderStatChip
              testId="ministries-total-chip"
              label={m.nav_ministries()}
              value={ministries.length}
            />
            <HeaderStatChip
              testId="ministries-review-chip"
              label={m.ministries_filter_review()}
              value={ministries.filter((item) => item.needsReview).length}
            />
            <HeaderStatChip
              testId="ministries-no-sectors-chip"
              label={m.ministries_filter_no_sectors()}
              value={ministries.filter((item) => item.sectorCount === 0).length}
            />
          </div>
        }
      />
      <form
        aria-label={m.ministries_filters_label()}
        className="flex flex-col gap-3 md:flex-row md:items-end"
        onSubmit={(event) => event.preventDefault()}
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
              setStatus((value as StatusFilter) ?? 'any')
            }
          >
            <SelectTrigger
              id="ministries-filter-status"
              className="min-h-11 w-full md:min-h-0 md:w-48"
            >
              <SelectValue>
                {status === 'review'
                  ? m.ministries_filter_review()
                  : status === 'no-sectors'
                    ? m.ministries_filter_no_sectors()
                    : m.ministries_filter_all()}
              </SelectValue>
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
      {isChurchAdmin ? (
        <div className="flex justify-end">
          <CreateMinistryDialog />
        </div>
      ) : null}
      {ministriesQuery.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center gap-3">
            <span>{m.ministries_load_failed()}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => ministriesQuery.refetch()}
            >
              {m.ministries_retry()}
            </Button>
          </AlertDescription>
        </Alert>
      ) : ministriesQuery.isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="space-y-2" role="status">
          <p className="text-muted-foreground">
            {isFiltered ? m.ministries_empty_filtered() : m.ministries_empty()}
          </p>
          {isFiltered ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 md:min-h-0"
              onClick={() => {
                setSearch('');
                setStatus('any');
              }}
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
              items={filtered}
              rowId={({ item }) => item.id}
              rowClassName={({ item }) =>
                item.needsReview ? REVIEW_TINT : undefined
              }
              renderCell={({ item, column }) => {
                switch (column.id) {
                  case 'name':
                    return (
                      <>
                        {item.name}
                        <MinistryNotice {...item} />
                      </>
                    );
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
          </CardContent>
        </Card>
      )}
    </WorkspacePage>
  );
}
