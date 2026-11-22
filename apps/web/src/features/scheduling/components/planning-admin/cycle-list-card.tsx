import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CycleStateBadge } from './cycle-state-badge';
import { NewCycleDialog } from './new-cycle-dialog';
import type { CyclesTableRow } from './planning-admin.types';
import { suggestCycleName, toCyclesTableRow } from './planning-admin.utils';
import { useCycleListNext } from './planning-admin-context';
import { RetryAlert } from './retry-alert';
import { DatePickerField } from '@/components/date-picker-field';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pending } from '@/components/ui/pending';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { ListCyclesParams } from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { adminApi } from '@/utils/api-instances';

/** No status means the current and upcoming Cycles: Draft and Sent. */
export type CycleStatusFilter = 'draft' | 'sent' | 'past' | 'all';

export interface CycleFilters {
  status?: CycleStatusFilter;
  search?: string;
  /** `yyyy-MM-dd`: only Cycles overlapping [from, to]. */
  from?: string;
  to?: string;
}

const CURRENT = 'current';
const SCOPE_OPTIONS = [CURRENT, 'all'] as const;
const STATE_OPTIONS = ['draft', 'sent', 'past'] as const;
type StatusOption =
  | (typeof SCOPE_OPTIONS)[number]
  | (typeof STATE_OPTIONS)[number];
const ACTION_SIZE = 'min-h-11 min-w-11 md:min-h-0 md:min-w-0';
const SKELETON_ROWS = [0, 1, 2];

interface StatusNameInput {
  status: StatusOption;
}

function statusName({ status }: StatusNameInput): string {
  if (status === CURRENT) return m.cycles_status_current();
  if (status === 'all') return m.cycles_status_all();
  if (status === 'draft') return m.cycles_chip_draft();
  if (status === 'sent') return m.cycles_chip_sent();
  return m.cycles_chip_past();
}

interface ToListParamsInput {
  filters: CycleFilters;
}

/** No status asks for the current period; `all` asks for every state. */
function toListParams({ filters }: ToListParamsInput): ListCyclesParams {
  const { status, ...rest } = filters;
  if (!status) return { ...rest, period: 'current' };
  if (status === 'all') return rest;
  return { ...rest, state: status };
}

interface EventCountInput {
  count: number;
}

function eventCountLabel({ count }: EventCountInput): string {
  if (count === 0) return m.cycles_event_count_zero();
  if (count === 1) return m.cycles_event_count_one();
  return m.cycles_event_count_other({ count });
}

/** The state, plus whether the Cycle is the one running today. */
function CycleStatus({ state, isRunning }: CyclesTableRow) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <CycleStateBadge state={state} />
      {isRunning ? (
        <Badge variant="outline" className="border-primary/40 text-primary">
          {m.cycles_running()}
        </Badge>
      ) : null}
    </span>
  );
}

function OpenAction({ id, name }: CyclesTableRow) {
  return (
    <Link
      to="/app/cycles/$cycleId"
      params={{ cycleId: id }}
      aria-label={m.cycles_open_label({ name })}
      className={buttonVariants({
        variant: 'outline',
        size: 'xs',
        className: ACTION_SIZE,
      })}
    >
      {m.cycles_open()}
    </Link>
  );
}

interface FilterBarProps {
  filters: CycleFilters;
  onChange: (filters: CycleFilters) => void;
}

function FilterBar({ filters, onChange }: FilterBarProps) {
  // On mobile the date range waits behind its own toggle, open once in use.
  const [datesOpen, setDatesOpen] = useState(
    Boolean(filters.from || filters.to),
  );
  const { search, setSearch, commitNow } = useDebouncedSearch({
    committed: filters.search ?? '',
    onCommit: (commit) => onChange({ ...filters, ...commit }),
  });
  const status: StatusOption = filters.status ?? CURRENT;
  // Date pickers read the size from context; the other controls opt in.
  const isMobile = useMediaQuery('(max-width: 767px)');

  return (
    <FormControlSizeProvider size={isMobile ? 'touch' : 'default'}>
      <form
        aria-label={m.cycles_filters_label()}
        className="flex flex-col gap-3 md:flex-row md:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          commitNow();
        }}
      >
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <Label htmlFor="cycles-filter-search">
            {m.cycles_filter_search()}
          </Label>
          <Input
            id="cycles-filter-search"
            type="search"
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={m.cycles_filter_search_placeholder()}
            className="min-h-11 md:min-h-0"
          />
        </div>
        {/* Mobile pairs Situação with the Datas toggle; desktop flows them inline. */}
        <div className="grid grid-cols-2 items-end gap-3 md:contents">
          <div className="flex flex-col gap-1">
            <Label htmlFor="cycles-filter-status">
              {m.cycles_filter_status()}
            </Label>
            <Select
              value={status}
              onValueChange={(value) =>
                onChange({
                  ...filters,
                  status:
                    !value || value === CURRENT
                      ? undefined
                      : (value as CycleStatusFilter),
                })
              }
            >
              <SelectTrigger
                id="cycles-filter-status"
                className="min-h-11 w-full md:min-h-0 md:w-44"
              >
                <SelectValue>{statusName({ status })}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SCOPE_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {statusName({ status: value })}
                  </SelectItem>
                ))}
                <SelectSeparator />
                {STATE_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {statusName({ status: value })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 md:hidden"
            aria-expanded={datesOpen}
            aria-controls="cycles-filter-dates"
            onClick={() => setDatesOpen((open) => !open)}
          >
            {m.cycles_filter_dates()}
            {filters.from || filters.to
              ? ` (${[filters.from, filters.to].filter(Boolean).length})`
              : null}
            <ChevronDownIcon
              aria-hidden
              className={cn('transition-transform', datesOpen && 'rotate-180')}
            />
          </Button>
        </div>
        <div
          id="cycles-filter-dates"
          className={cn(
            'grid grid-cols-2 gap-3 md:flex',
            !datesOpen && 'max-md:hidden',
          )}
        >
          <div className="flex flex-col gap-1 md:w-40">
            <Label id="cycles-filter-from-label" htmlFor="cycles-filter-from">
              {m.cycles_filter_from()}
            </Label>
            <DatePickerField
              id="cycles-filter-from"
              aria-labelledby="cycles-filter-from-label"
              value={filters.from ?? ''}
              maxDate={filters.to}
              onChange={(from) => onChange({ ...filters, from })}
              onClear={() => onChange({ ...filters, from: undefined })}
            />
          </div>
          <div className="flex flex-col gap-1 md:w-40">
            <Label id="cycles-filter-to-label" htmlFor="cycles-filter-to">
              {m.cycles_filter_to()}
            </Label>
            <DatePickerField
              id="cycles-filter-to"
              aria-labelledby="cycles-filter-to-label"
              value={filters.to ?? ''}
              minDate={filters.from}
              onChange={(to) => onChange({ ...filters, to })}
              onClear={() => onChange({ ...filters, to: undefined })}
            />
          </div>
        </div>
      </form>
    </FormControlSizeProvider>
  );
}

interface CycleListCardProps {
  filters: CycleFilters;
  onFiltersChange: (filters: CycleFilters) => void;
}

/** The Church's Cycles the server filters, in its order: newest start first. */
export function CycleListCard({
  filters,
  onFiltersChange,
}: CycleListCardProps) {
  const query = useQuery({
    queryKey: ['cycles', 'list', filters],
    queryFn: () => adminApi.listCycles(toListParams({ filters })),
    placeholderData: keepPreviousData,
    // The RetryAlert below reports a failed read; no global toast on top.
    meta: { showsOwnError: true },
  });
  // Plain local state: opening or cancelling New cycle never touches the URL.
  const [newCycleOpen, setNewCycleOpen] = useState(false);
  const isFiltered = Object.values(filters).some(Boolean);
  const rows = (query.data?.cycles ?? []).map((cycle) =>
    toCyclesTableRow({
      cycle,
      currentCycleId: query.data?.currentCycleId,
    }),
  );
  const next = useCycleListNext();
  const nextMonth = next
    ? suggestCycleName({ startDate: next.startDate, locale: getLocale() })
    : '';
  // The default scope leaves Past Cycles out; say how many match and offer them.
  const hiddenPast =
    !filters.status && query.data ? query.data.pastMatching : 0;
  const showPast = () => onFiltersChange({ ...filters, status: 'past' });
  const nextStart = next?.startDate;
  const nextEnd = next?.endDate;
  // Stable while the suggestion holds: the dialog resets its draft when it changes.
  const nextValues = useMemo(
    () =>
      nextStart && nextEnd
        ? { name: '', startDate: nextStart, endDate: nextEnd }
        : undefined,
    [nextStart, nextEnd],
  );

  return (
    <>
      <FilterBar filters={filters} onChange={onFiltersChange} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* An empty result offers its own way out, beside its message. */}
        {isFiltered && rows.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 md:min-h-0"
            onClick={() => onFiltersChange({})}
          >
            {m.cycles_clear_filters()}
          </Button>
        ) : null}
        <div className="ml-auto">
          <Button
            type="button"
            data-testid="open-create-cycle-dialog-button"
            className="min-h-11 md:min-h-0"
            onClick={() => setNewCycleOpen(true)}
          >
            {next?.isDue
              ? m.cycles_next_create({ month: nextMonth })
              : m.cycles_new()}
          </Button>
        </div>
      </div>
      <NewCycleDialog
        open={newCycleOpen}
        onOpenChange={setNewCycleOpen}
        initialValues={nextValues}
      />
      {query.isLoading || query.isPlaceholderData ? (
        <Card className="surface-panel">
          {/* The real table's header and rows on desktop, the card height on mobile. */}
          <CardContent>
            <Pending label={m.cycles_loading()} className="grid gap-3 md:gap-0">
              <Skeleton className="hidden h-[41px] w-full md:block" />
              {SKELETON_ROWS.map((row) => (
                <Skeleton
                  key={row}
                  className="h-20 w-full md:mt-px md:h-[40px]"
                />
              ))}
            </Pending>
          </CardContent>
        </Card>
      ) : query.isError ? (
        <RetryAlert
          message={m.cycles_load_failed()}
          testId="cycles-load-error"
          onRetry={() => void query.refetch()}
        />
      ) : rows.length === 0 ? (
        <div className="space-y-2" role="status" data-testid="cycles-empty">
          <p className="text-muted-foreground">
            {hiddenPast === 1
              ? m.cycles_empty_past_match_one()
              : hiddenPast > 1
                ? m.cycles_empty_past_match_other({ count: hiddenPast })
                : isFiltered
                  ? m.cycles_empty_filtered()
                  : m.cycles_empty_current()}
          </p>
          {hiddenPast > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 md:min-h-0"
              onClick={showPast}
            >
              {m.cycles_past_show()}
            </Button>
          ) : isFiltered ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 md:min-h-0"
              onClick={() => onFiltersChange({})}
            >
              {m.cycles_clear_filters()}
            </Button>
          ) : null}
        </div>
      ) : (
        <Card className="surface-panel">
          <CardContent>
            <DataTable<CyclesTableRow>
              aria-label={m.cycles_title()}
              columns={[
                { id: 'name', name: m.cycles_column_name(), isRowHeader: true },
                { id: 'window', name: m.cycles_column_window() },
                { id: 'events', name: m.cycles_column_events() },
                { id: 'status', name: m.cycles_column_status() },
                { id: 'actions', name: m.cycles_column_actions() },
              ]}
              items={rows}
              rowId={({ item }) => item.id}
              rowTestId={({ item }) => `cycle-row-${item.id}`}
              renderCell={({ item, column }) => {
                switch (column.id) {
                  case 'name':
                    return <span className="font-medium">{item.name}</span>;
                  case 'window':
                    return item.window;
                  case 'events':
                    return (
                      <span className="text-muted-foreground">
                        {eventCountLabel({ count: item.eventCount })}
                      </span>
                    );
                  case 'status':
                    return <CycleStatus {...item} />;
                  default:
                    return <OpenAction {...item} />;
                }
              }}
              renderMobileCard={({ item }) => (
                <div
                  data-testid="cycle-option"
                  className="surface-subtle workspace-panel flex flex-wrap items-center gap-x-3 gap-y-2"
                >
                  <div className="min-w-0 flex-1 basis-40 space-y-1">
                    <p className="break-words font-medium">{item.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {item.window} ·{' '}
                      {eventCountLabel({ count: item.eventCount })}
                    </p>
                    <CycleStatus {...item} />
                  </div>
                  <div className="ml-auto">
                    <OpenAction {...item} />
                  </div>
                </div>
              )}
            />
          </CardContent>
        </Card>
      )}
      {hiddenPast > 0 && rows.length > 0 && !query.isPlaceholderData ? (
        <p
          className="flex flex-wrap items-center gap-x-3 gap-y-2 text-muted-foreground text-sm"
          data-testid="cycles-past-hidden"
        >
          {hiddenPast === 1
            ? m.cycles_past_hidden_one()
            : m.cycles_past_hidden_other({ count: hiddenPast })}
          <Button
            type="button"
            variant="outline"
            size="xs"
            className={ACTION_SIZE}
            onClick={showPast}
          >
            {m.cycles_past_show()}
          </Button>
        </p>
      ) : null}
    </>
  );
}
