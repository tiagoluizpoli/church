import { m } from '@church/i18n/messages';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  type PeopleFilters,
  usePeopleList,
} from '@/features/people/people-queries';
import type {
  ListPeople200ItemsItem,
  ListPeople200Options,
} from '@/infrastructure/api/churchAPI.schemas';

const ANY = 'any';
const ACCESS_VALUES = ['admin', 'leader', 'volunteer'] as const;

function accessLabel(value: string): string {
  if (value === 'admin') return m.join_church_access_admin();
  return value === 'leader'
    ? m.ministry_invitation_access_leader()
    : m.ministry_invitation_access_volunteer();
}

interface PersonRowProps {
  person: ListPeople200ItemsItem;
}

function PersonRow({ person }: PersonRowProps) {
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 break-words font-medium">{person.name}</span>
        {person.isAdmin ? (
          <Badge variant="secondary">{m.join_church_access_admin()}</Badge>
        ) : null}
      </div>
      <p className="break-all text-muted-foreground text-sm">{person.email}</p>
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
    </li>
  );
}

interface FilterBarProps {
  filters: PeopleFilters;
  options?: ListPeople200Options;
  onChange: (filters: PeopleFilters) => void;
}

function FilterBar({ filters, options, onChange }: FilterBarProps) {
  const [search, setSearch] = useState(filters.search ?? '');
  const showMinistry = (options?.ministries.length ?? 0) > 0;
  return (
    <form
      aria-label={m.people_filters_label()}
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onChange({ ...filters, search: search.trim() || undefined });
      }}
    >
      <div className="min-w-48 flex-1 space-y-1">
        <Label htmlFor="people-filter-search">{m.people_filter_search()}</Label>
        <Input
          id="people-filter-search"
          type="search"
          value={search}
          maxLength={254}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {showMinistry ? (
        <div className="space-y-1">
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
            <SelectTrigger id="people-filter-ministry" className="w-48">
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
      <div className="space-y-1">
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
          <SelectTrigger id="people-filter-access" className="w-40">
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
      <Button type="submit" variant="outline">
        {m.invitations_filter_search()}
      </Button>
    </form>
  );
}

/** The Active Church's members within the caller's authority, filterable and paged by name. */
export function PeopleDirectoryPage() {
  const [filters, setFilters] = useState<PeopleFilters>({});
  const query = usePeopleList({ filters });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const options = query.data?.pages[0]?.options;
  const isFiltered = Boolean(
    filters.search || filters.ministryId || filters.access,
  );
  // A new filter set shows the previous rows only as placeholder data.
  const loading = query.isLoading || query.isPlaceholderData;

  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title={m.nav_people()}
        description={m.people_description()}
        autoFocusTitle
      />
      <FilterBar
        key={filters.search ?? ''}
        filters={filters}
        options={options}
        onChange={setFilters}
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
              {m.invitations_retry()}
            </Button>
          </AlertDescription>
        </Alert>
      ) : loading ? (
        <div className="grid gap-3" data-testid="people-loading">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="space-y-2" role="status">
          <p className="text-muted-foreground">
            {isFiltered ? m.people_empty_filtered() : m.people_empty()}
          </p>
          {isFiltered ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setFilters({})}
            >
              {m.invitations_clear_filters()}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <ul
            aria-label={m.people_list_label()}
            className="surface-panel divide-y divide-border"
          >
            {items.map((person) => (
              <PersonRow key={person.id} person={person} />
            ))}
          </ul>
          {query.isFetchNextPageError ? (
            <Alert variant="destructive">
              <AlertDescription>{m.people_load_failed()}</AlertDescription>
            </Alert>
          ) : null}
          {query.hasNextPage ? (
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
        </>
      )}
    </WorkspacePage>
  );
}
