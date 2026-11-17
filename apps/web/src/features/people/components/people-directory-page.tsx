import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { HeaderStatChip } from '@/components/header-stat-chip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import {
  PEOPLE_SEARCH_MAX_LENGTH,
  type PeopleFilters,
  usePeopleList,
} from '@/features/people/people-queries';
import type {
  ListPeople200ItemsItem,
  ListPeople200Options,
} from '@/infrastructure/api/churchAPI.schemas';

const ANY = 'any';
const SEARCH_DEBOUNCE_MS = 300;
const SKELETON_ROWS = [0, 1, 2];
const FIELD = 'flex flex-col gap-1';
const TRIGGER = 'min-h-11 w-full md:min-h-0 md:w-48';
const WITHOUT_MINISTRY = 'without-ministry';
const ACCESS_VALUES = ['admin', 'leader', 'volunteer'] as const;

function accessLabel(value: string): string {
  if (value === 'admin') return m.join_church_access_admin();
  return value === 'leader'
    ? m.ministry_invitation_access_leader()
    : m.ministry_invitation_access_volunteer();
}

interface PersonProps {
  person: ListPeople200ItemsItem;
}

function PersonMinistries({ person }: PersonProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {person.ministries.length === 0 ? (
        <span className="text-muted-foreground">
          {m.people_no_ministries()}
        </span>
      ) : (
        person.ministries.map((ministry) => (
          <Badge key={ministry.id} variant="outline">
            {ministry.name}
            {ministry.ministryAccessLevel === 'leader'
              ? ` · ${accessLabel('leader')}`
              : ''}
          </Badge>
        ))
      )}
    </div>
  );
}

function personColumns(): DataTableColumn[] {
  return [
    { id: 'name', name: m.people_column_name(), isRowHeader: true },
    { id: 'email', name: m.people_column_email() },
    { id: 'ministries', name: m.people_column_ministries() },
    { id: 'actions', name: m.people_column_actions() },
  ];
}

function PersonAction({ person }: PersonProps) {
  return (
    <div className="flex justify-end max-md:ml-auto md:w-full">
      <Link
        to="/people/$memberId"
        params={{ memberId: person.id }}
        aria-label={m.people_view_label({ name: person.name })}
        className={buttonVariants({
          variant: 'outline',
          size: 'xs',
          className: 'min-h-11 min-w-11 md:min-h-0 md:min-w-0',
        })}
      >
        {m.people_view()}
      </Link>
    </div>
  );
}

function PersonName({ person }: PersonProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="break-words font-medium">{person.name}</span>
      {person.isAdmin ? (
        <Badge variant="secondary">{m.join_church_access_admin()}</Badge>
      ) : null}
    </div>
  );
}

interface FilterBarProps {
  filters: PeopleFilters;
  options?: ListPeople200Options;
  onChange: (filters: PeopleFilters) => void;
}

function FilterBar({ filters, options, onChange }: FilterBarProps) {
  const committed = filters.search ?? '';
  const [search, setSearch] = useState(committed);
  const [syncedSearch, setSyncedSearch] = useState(committed);
  // A URL change from outside (clear filters, back/forward) replaces the typed text; our own commit keeps it as typed.
  if (committed !== syncedSearch) {
    setSyncedSearch(committed);
    if (committed !== search.trim()) setSearch(committed);
  }
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The latest filters and handler, so a pending debounce never applies stale ones and a parent re-render does not restart it.
  const latest = useRef({ filters, onChange });
  latest.current = { filters, onChange };
  const trimmed = search.trim();
  const commitSearch = () => {
    clearTimeout(timer.current);
    latest.current.onChange({
      ...latest.current.filters,
      search: trimmed || undefined,
    });
  };
  // Enter commits now and cancels the pending debounce, so it cannot fire after a click away.
  useEffect(() => {
    if (trimmed === committed) return;
    timer.current = setTimeout(
      () =>
        latest.current.onChange({
          ...latest.current.filters,
          search: trimmed || undefined,
        }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer.current);
  }, [trimmed, committed]);
  const showMinistry = (options?.ministries.length ?? 0) > 0;
  return (
    <form
      aria-label={m.people_filters_label()}
      className="flex flex-col gap-3 md:flex-row md:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        commitSearch();
      }}
    >
      <div className={`${FIELD} min-w-48 flex-1`}>
        <Label htmlFor="people-filter-search">{m.people_filter_search()}</Label>
        <Input
          id="people-filter-search"
          type="search"
          value={search}
          maxLength={PEOPLE_SEARCH_MAX_LENGTH}
          onChange={(event) => setSearch(event.target.value)}
          className="min-h-11 md:min-h-0"
        />
      </div>
      {showMinistry ? (
        <div className={FIELD}>
          <Label htmlFor="people-filter-ministry">
            {m.people_filter_ministry()}
          </Label>
          <Select
            value={filters.ministryId ?? ANY}
            onValueChange={(value) =>
              onChange({
                ...filters,
                ministryId: value === ANY ? undefined : (value ?? undefined),
              })
            }
          >
            <SelectTrigger id="people-filter-ministry" className={TRIGGER}>
              <SelectValue>
                {options?.ministries.find((x) => x.id === filters.ministryId)
                  ?.name ?? m.invitations_filter_any()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{m.invitations_filter_any()}</SelectItem>
              {options?.ministries.map((ministry) => (
                <SelectItem key={ministry.id} value={ministry.id}>
                  {ministry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className={FIELD}>
        <Label htmlFor="people-filter-access">{m.people_filter_access()}</Label>
        <Select
          value={filters.access ?? ANY}
          onValueChange={(value) =>
            onChange({
              ...filters,
              access:
                value === ANY ? undefined : (value as PeopleFilters['access']),
            })
          }
        >
          <SelectTrigger id="people-filter-access" className={TRIGGER}>
            <SelectValue>
              {filters.access
                ? accessLabel(filters.access)
                : m.invitations_filter_any()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{m.invitations_filter_any()}</SelectItem>
            {ACCESS_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {accessLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={FIELD}>
        <Label htmlFor="people-filter-membership">
          {m.people_filter_membership()}
        </Label>
        <Select
          value={filters.withoutMinistry ? WITHOUT_MINISTRY : ANY}
          onValueChange={(value) =>
            onChange({
              ...filters,
              withoutMinistry: value === WITHOUT_MINISTRY || undefined,
            })
          }
        >
          <SelectTrigger id="people-filter-membership" className={TRIGGER}>
            <SelectValue>
              {filters.withoutMinistry
                ? m.people_stat_without_ministry()
                : m.invitations_filter_any()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{m.invitations_filter_any()}</SelectItem>
            <SelectItem value={WITHOUT_MINISTRY}>
              {m.people_stat_without_ministry()}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </form>
  );
}

interface PeopleDirectoryPageProps {
  /** The route's search params; the page never keeps its own copy. */
  filters: PeopleFilters;
  onFiltersChange: (filters: PeopleFilters) => void;
}

/** The Active Church's members within the caller's authority, filterable and paged by name. */
export function PeopleDirectoryPage({
  filters,
  onFiltersChange,
}: PeopleDirectoryPageProps) {
  const query = usePeopleList({ filters });
  // A refused refetch keeps React Query's previous pages; drop them so refused rows and options are not shown.
  const data =
    query.isError && !query.isFetchNextPageError ? undefined : query.data;
  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const options = data?.pages[0]?.options;
  const counts = data?.pages[0]?.counts;
  const isFiltered = Boolean(
    filters.search ||
      filters.ministryId ||
      filters.access ||
      filters.withoutMinistry,
  );
  // A new filter set shows the previous rows only as placeholder data.
  const loading = query.isLoading || query.isPlaceholderData;

  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title={m.nav_people()}
        description={m.people_description()}
        autoFocusTitle
        aside={
          counts ? (
            <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
              <HeaderStatChip
                testId="people-total-chip"
                label={m.people_stat_total()}
                value={counts.total}
              />
              <HeaderStatChip
                testId="people-admins-chip"
                label={m.people_stat_admins()}
                value={counts.admins}
              />
              <HeaderStatChip
                testId="people-leaders-chip"
                label={m.people_stat_leaders()}
                value={counts.leaders}
              />
              <HeaderStatChip
                testId="people-volunteers-chip"
                label={m.people_stat_volunteers()}
                value={counts.volunteers}
              />
              <HeaderStatChip
                testId="people-no-ministry-chip"
                label={m.people_stat_without_ministry()}
                value={counts.withoutMinistry}
              />
            </div>
          ) : undefined
        }
      />
      <FilterBar
        filters={filters}
        options={options}
        onChange={onFiltersChange}
      />
      {query.isError && items.length === 0 ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center gap-3">
            <span>{m.people_load_failed()}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => query.refetch()}
            >
              {m.common_retry()}
            </Button>
          </AlertDescription>
        </Alert>
      ) : loading ? (
        <Card className="surface-panel">
          {/* The real table's header and 41px rows on desktop, the card height on mobile, so the list does not jump in. */}
          <CardContent>
            <Pending
              className="grid gap-3 md:gap-0"
              data-testid="people-loading"
            >
              <Skeleton className="hidden h-[41px] w-full md:block" />
              {SKELETON_ROWS.map((row) => (
                <Skeleton
                  key={row}
                  className="h-27 w-full md:mt-px md:h-[40px]"
                />
              ))}
            </Pending>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <div className="space-y-2" role="status">
          <p className="text-muted-foreground">
            {isFiltered ? m.people_empty_filtered() : m.people_empty()}
          </p>
          {isFiltered ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 md:min-h-0"
              onClick={() => onFiltersChange({})}
            >
              {m.invitations_clear_filters()}
            </Button>
          ) : null}
        </div>
      ) : (
        <Card className="surface-panel">
          <CardContent className="space-y-3">
            <DataTable
              aria-label={m.people_list_label()}
              columns={personColumns()}
              items={items}
              rowId={({ item }) => item.id}
              renderCell={({ item, column }) => {
                if (column.id === 'name') return <PersonName person={item} />;
                if (column.id === 'email')
                  return <span className="break-all">{item.email}</span>;
                if (column.id === 'ministries')
                  return <PersonMinistries person={item} />;
                if (column.id === 'actions')
                  return <PersonAction person={item} />;
                return null;
              }}
              renderMobileCard={({ item }) => (
                <div className="surface-subtle workspace-panel flex flex-wrap items-end gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1 basis-40 space-y-2">
                    <PersonName person={item} />
                    <p className="break-all text-muted-foreground text-sm">
                      {item.email}
                    </p>
                    <PersonMinistries person={item} />
                  </div>
                  <PersonAction person={item} />
                </div>
              )}
            />
            {query.isFetchNextPageError ? (
              <Alert variant="destructive">
                <AlertDescription className="flex items-center gap-3">
                  <span>{m.people_load_failed()}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={query.isFetchingNextPage}
                    onClick={() => query.fetchNextPage()}
                  >
                    {m.common_retry()}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {query.hasNextPage && !query.isFetchNextPageError ? (
              <Button
                type="button"
                variant="outline"
                disabled={query.isFetchingNextPage}
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
    </WorkspacePage>
  );
}
