import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import {
  addCalendarDays,
  formatMonthYear,
  now,
  parseCalendarDay,
  weekdayIndex,
} from '@church/time';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import {
  ChevronDownIcon,
  ChevronRight,
  ChevronUpIcon,
  FilterIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useMyScheduleRefresh } from '../hooks/use-my-schedule-refresh';
import { useOnlineState } from '../hooks/use-online-state';
import {
  assignmentDayLabel,
  relativeDayName,
  startsIn,
} from '../lib/assignment-day-label';
import { cachedReadOptions, fetchAndCache } from '../lib/my-schedule-cache';
import {
  DEFAULT_GROUPS,
  GROUP_LEVELS,
  type GroupLevel,
  groupLevels,
  MY_SCHEDULE_SEARCH_MAX_LENGTH,
  type MyScheduleFilters,
} from '../lib/my-schedule-filters';
import {
  type CachedMySchedule,
  cachedMyScheduleSchema,
} from '../lib/my-schedule-schemas';
import {
  AssignmentBadges,
  assignmentRoleLine,
  assignmentTimeRange,
} from './assignment-link';
import { BackgroundRefreshIndicator } from './background-refresh-indicator';
import { MyScheduleOfflineBanner } from './my-schedule-offline-banner';
import { HeaderStatChip } from '@/components/header-stat-chip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import {
  GROUP_INDENT,
  type GroupedGroupRow,
  type GroupedRow,
  GroupRowLabel,
  groupedRowProps,
  groupLeaves,
  leafIndentStep,
  MOBILE_RAIL,
  MobileGroupHeading,
  useGroupCollapse,
} from '@/components/ui/data-table-groups';
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
import type {
  GetPublishedVolunteerSchedule200,
  GetPublishedVolunteerSchedule200SchedulesItem as MinistrySchedule,
  GetPublishedVolunteerSchedule200AssignmentsItem as ScheduleAssignment,
} from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { dayOf, formatCalendarDateOnly } from '@/shared/utils/church-time';
import { volunteerApi } from '@/utils/api-instances';

const ACTION_SIZE = 'min-h-11 min-w-11 md:min-h-0 md:min-w-0';
const ANY = 'any';

interface DayRow {
  assignment: ScheduleAssignment;
  /** `Today` / `Tomorrow`, or null for any other day. */
  relative: string | null;
  date: string;
  /** Group keys of the Church day: `yyyy-MM`, its week's Sunday, the day. */
  month: string;
  week: string;
  day: string;
}

type ListRow = GroupedRow<DayRow>;
type GroupRow = GroupedGroupRow<DayRow>;

/** `Novembro 2026` for a `yyyy-MM` month. */
function monthLabel(month: string): string {
  return formatMonthYear({
    day: parseCalendarDay({ value: `${month}-01` }),
    locale: getLocale(),
  });
}

/** The cycle review's week label, Sunday to Saturday. */
function weekLabel(week: string): string {
  return m.cycle_review_week({
    start: formatCalendarDateOnly({ value: week }),
    end: formatCalendarDateOnly({
      value: addCalendarDays({
        day: parseCalendarDay({ value: week }),
        days: 6,
      }),
    }),
  });
}

interface ToRowsInput {
  assignments: ScheduleAssignment[];
  timeZone: string;
}

function toDayRows({ assignments, timeZone }: ToRowsInput): DayRow[] {
  return assignments.map((assignment) => {
    const day = dayOf({ value: assignment.startTime, timeZone });
    return {
      assignment,
      relative: relativeDayName({ startTime: assignment.startTime, timeZone }),
      date: assignmentDayLabel({ startTime: assignment.startTime, timeZone }),
      month: day.slice(0, 7),
      week: addCalendarDays({ day, days: -weekdayIndex({ day }) }),
      day,
    };
  });
}

interface ToListRowsInput {
  rows: DayRow[];
  levels: GroupLevel[];
}

// The read is already ordered by start, so a group starts wherever its key changes.
function toListRows({ rows, levels }: ToListRowsInput): ListRow[] {
  return groupLeaves({
    leaves: rows,
    levels: levels.map((level) => (row: DayRow) => row[level]),
    leafKey: (row) => row.assignment.assignmentId,
  });
}

interface RowContext {
  timeZone: string;
  showMinistry: boolean;
}

interface NextAssignmentProps extends RowContext {
  row: DayRow;
}

/**
 * The answer to "when do I serve next", as its own panel: a vertical card in
 * the side column beside the table on wide screens, stacked above it below.
 */
function NextAssignment({ row, timeZone, showMinistry }: NextAssignmentProps) {
  const { assignment } = row;
  const countdown = startsIn({ startTime: assignment.startTime, timeZone });
  return (
    <section aria-labelledby="next-assignment">
      <Card className="surface-panel">
        <CardHeader>
          <h2 id="next-assignment" className="workspace-section-title">
            {m.home_next_assignment()}
          </h2>
        </CardHeader>
        <CardContent>
          <Link
            to="/app/my-schedule/$assignmentId"
            params={{ assignmentId: assignment.assignmentId }}
            // The panel holds only this one shift, so the link is the panel's content, not a box inside it.
            className="group radius-control flex flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring md:gap-4"
          >
            {/* The day as a solid date tile: the one strong accent on the page. */}
            <span className="radius-control flex items-baseline justify-between gap-2 bg-primary px-4 py-3 text-primary-foreground">
              <span className="font-semibold text-lg leading-tight">
                {row.relative ?? row.date}
              </span>{' '}
              {row.relative ? (
                <span className="text-primary-foreground/85 text-sm">
                  {row.date}
                </span>
              ) : null}
            </span>{' '}
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span className="whitespace-nowrap font-semibold text-xl tabular-nums md:text-2xl">
                    {assignmentTimeRange({ assignment, timeZone })}
                  </span>{' '}
                  {countdown ? (
                    <span className="font-medium text-primary text-sm">
                      {countdown}
                    </span>
                  ) : null}
                </span>{' '}
                <span className="block break-words pt-1 font-medium text-base">
                  {assignment.eventTitle}
                </span>{' '}
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-sm">
                  <span className="break-words">
                    {assignmentRoleLine({ assignment, showMinistry })}
                  </span>{' '}
                  <AssignmentBadges assignment={assignment} />
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
              />
            </span>
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}

interface DayNameProps {
  row: DayRow;
  /** In the table below xl the date beside `Today` is read, not shown, so the row fits. */
  compact?: boolean;
}

/** `Today` strong with the date muted beside it, or the date alone. */
function DayName({ row, compact = false }: DayNameProps) {
  return row.relative ? (
    <span className="inline-flex items-baseline gap-2">
      <span className="font-semibold">{row.relative}</span>{' '}
      <span
        className={cn(
          'font-normal text-muted-foreground',
          compact && 'max-xl:sr-only',
        )}
      >
        {row.date}
      </span>
    </span>
  ) : (
    row.date
  );
}

interface OpenAssignmentProps extends RowContext {
  row: DayRow;
}

function OpenAssignment({ row, timeZone }: OpenAssignmentProps) {
  const { assignment } = row;
  return (
    <div className="flex justify-end max-md:ml-auto md:w-full">
      <Link
        to="/app/my-schedule/$assignmentId"
        params={{ assignmentId: assignment.assignmentId }}
        aria-label={m.my_schedule_open_label({
          event: assignment.eventTitle,
          day: row.date,
          time: assignmentTimeRange({ assignment, timeZone }),
        })}
        className={buttonVariants({
          variant: 'outline',
          size: 'xs',
          className: ACTION_SIZE,
        })}
      >
        {m.schedules_open()}
      </Link>
    </div>
  );
}

interface UpcomingTableProps extends RowContext {
  rows: ListRow[];
  levels: GroupLevel[];
}

/** Mobile group headings, weight stepping down with depth. */
const MOBILE_GROUP_CLASS: Record<GroupLevel, string> = {
  month: 'font-semibold text-base',
  week: 'font-medium text-sm',
  day: 'font-medium text-sm',
};

interface GroupLabelProps {
  item: GroupRow;
  level: GroupLevel;
}

function GroupLabel({ item, level }: GroupLabelProps) {
  if (level === 'month') return monthLabel(item.leaf.month);
  if (level === 'week') return weekLabel(item.leaf.week);
  return <DayName row={item.leaf} />;
}

function groupName({ item, level }: GroupLabelProps): string {
  if (level === 'month') return monthLabel(item.leaf.month);
  if (level === 'week') return weekLabel(item.leaf.week);
  return [item.leaf.relative, item.leaf.date].filter(Boolean).join(' ');
}

function UpcomingTable({
  rows,
  levels,
  timeZone,
  showMinistry,
}: UpcomingTableProps) {
  const { setCollapsed, toggle, visible } = useGroupCollapse();
  const context: RowContext = { timeZone, showMinistry };
  const byDay = levels.includes('day');
  const groupKeys = rows.flatMap((row) =>
    row.kind === 'group' ? [row.key] : [],
  );
  return (
    <div className="space-y-3">
      {levels.length > 0 ? (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 md:min-h-0"
            onClick={() => setCollapsed(new Set())}
          >
            {m.cycle_review_expand_all()}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 md:min-h-0"
            onClick={() => setCollapsed(new Set(groupKeys))}
          >
            {m.cycle_review_collapse_all()}
          </Button>
        </div>
      ) : null}
      <DataTable<ListRow>
        aria-label={m.nav_my_schedule()}
        columns={[
          // Under day groups the day row says it, so its column goes.
          ...(byDay ? [] : [{ id: 'day', name: m.my_schedule_column_day() }]),
          { id: 'time', name: m.my_schedule_column_time() },
          {
            id: 'event',
            name: m.assignment_field_event(),
            isRowHeader: true,
          },
          {
            id: 'role',
            name: showMinistry
              ? m.my_schedule_column_role_ministry()
              : m.my_schedule_column_role(),
          },
          { id: 'actions', name: m.people_column_actions() },
        ]}
        items={visible({ rows })}
        rowId={({ item }) =>
          item.kind === 'group'
            ? `${levels[item.depth]}-${item.key}`
            : item.leaf.assignment.assignmentId
        }
        // Group rows span the row, so a long label never widens a column.
        {...groupedRowProps<DayRow>({
          nestLeaves: true,
          groupClassName: (group) =>
            levels[group.depth] === 'month'
              ? 'font-semibold text-sm'
              : 'font-medium text-sm',
        })}
        renderCell={({ item: row, column }) => {
          if (row.kind === 'group')
            return (
              <GroupRowLabel
                item={row}
                label={<GroupLabel item={row} level={levels[row.depth]} />}
                name={groupName({ item: row, level: levels[row.depth] })}
                onToggle={toggle}
                buttonClassName={ACTION_SIZE}
              />
            );
          const item = row.leaf;
          const { assignment } = item;
          switch (column.id) {
            case 'day':
              return (
                <span
                  className={cn(
                    'block',
                    GROUP_INDENT[
                      leafIndentStep({ depth: row.depth, nested: true })
                    ],
                  )}
                >
                  <DayName row={item} compact />
                </span>
              );
            case 'time':
              return (
                <span
                  className={cn(
                    'block tabular-nums',
                    byDay &&
                      GROUP_INDENT[
                        leafIndentStep({ depth: row.depth, nested: true })
                      ],
                  )}
                >
                  {assignmentTimeRange({ assignment, timeZone })}
                </span>
              );
            case 'event':
              return (
                <span className="flex items-center gap-2">
                  {/* Rows stay one line: long titles truncate, the full title is one tap away. */}
                  <span
                    className="block max-w-24 truncate xl:max-w-56 2xl:max-w-52 min-[1800px]:max-w-96"
                    title={assignment.eventTitle}
                  >
                    {assignment.eventTitle}
                  </span>
                  <AssignmentBadges assignment={assignment} />
                </span>
              );
            case 'role':
              return (
                <span
                  className="block max-w-24 truncate text-muted-foreground xl:max-w-56 2xl:max-w-52 min-[1800px]:max-w-80"
                  title={assignmentRoleLine({ assignment, showMinistry })}
                >
                  {assignmentRoleLine({ assignment, showMinistry })}
                </span>
              );
            default:
              return <OpenAssignment row={item} {...context} />;
          }
        }}
        renderMobileCard={({ item: row }) => {
          const rail = MOBILE_RAIL[row.depth];
          if (row.kind === 'group')
            return (
              <MobileGroupHeading
                item={row}
                label={<GroupLabel item={row} level={levels[row.depth]} />}
                className={MOBILE_GROUP_CLASS[levels[row.depth]]}
                onToggle={toggle}
              />
            );
          const item = row.leaf;
          const { assignment } = item;
          const time = assignmentTimeRange({ assignment, timeZone });
          // The Usual setup card: the whole card opens the shift.
          return (
            <div className={rail}>
              <Link
                to="/app/my-schedule/$assignmentId"
                params={{ assignmentId: assignment.assignmentId }}
                aria-label={m.my_schedule_open_label({
                  event: assignment.eventTitle,
                  day: item.date,
                  time,
                })}
                className="surface-subtle radius-control flex items-center gap-3 p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1 space-y-0.5">
                  {byDay ? null : (
                    <span className="block text-muted-foreground text-xs">
                      <DayName row={item} />
                    </span>
                  )}
                  <span className="block break-words font-medium text-sm">
                    <span className="tabular-nums">{time}</span>{' '}
                    {assignment.eventTitle}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
                    <span className="break-words">
                      {assignmentRoleLine({ assignment, showMinistry })}
                    </span>{' '}
                    <AssignmentBadges assignment={assignment} />
                  </span>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </Link>
            </div>
          );
        }}
      />
    </div>
  );
}

function groupLevelName(level: GroupLevel): string {
  if (level === 'month') return m.my_schedule_filter_month();
  if (level === 'week') return m.my_schedule_group_week();
  return m.my_schedule_column_day();
}

interface FilterBarProps {
  filters: MyScheduleFilters;
  options: NonNullable<CachedMySchedule['options']>;
  disabled: boolean;
  onChange: (filters: MyScheduleFilters) => void;
}

/** Narrows the list only; the counters and the next shift always cover everything. */
function FilterBar({ filters, options, disabled, onChange }: FilterBarProps) {
  const { search, setSearch, commitNow } = useDebouncedSearch({
    committed: filters.search ?? '',
    onCommit: (commit) => onChange({ ...filters, ...commit }),
  });
  const month = filters.month ?? ANY;
  const ministryId = filters.ministryId ?? ANY;
  const levels = groupLevels(filters);
  const toggle = (level: GroupLevel) => {
    const next = GROUP_LEVELS.filter((x) =>
      x === level ? !levels.includes(x) : levels.includes(x),
    );
    const isDefault = next.join() === DEFAULT_GROUPS.join();
    onChange({ ...filters, group: isDefault ? undefined : next });
  };
  const [open, setOpen] = useState(false);
  // What the folded panel holds and has changed from its default.
  const activeCount = [filters.month, filters.ministryId, filters.group].filter(
    (value) => value !== undefined,
  ).length;
  return (
    <form
      aria-label={m.my_schedule_filters_label()}
      // Phones: search and a Filters button, the rest folded so the list starts within reach;
      // from md everything sits on one line.
      className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 md:flex md:flex-wrap"
      onSubmit={(event) => {
        event.preventDefault();
        commitNow();
      }}
    >
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <Label htmlFor="my-schedule-filter-search">
          {m.my_schedule_filter_search()}
        </Label>
        <Input
          id="my-schedule-filter-search"
          type="search"
          value={search}
          maxLength={MY_SCHEDULE_SEARCH_MAX_LENGTH}
          disabled={disabled}
          onChange={(event) => setSearch(event.target.value)}
          className="min-h-11 md:min-h-0"
        />
      </div>
      {/* The cycle builder's filters trigger, phones only. */}
      <Button
        type="button"
        variant="outline"
        className="min-h-11 md:hidden"
        aria-expanded={open}
        aria-controls="my-schedule-more-filters"
        onClick={() => setOpen((value) => !value)}
      >
        <FilterIcon className="size-3.5" />
        {m.my_schedule_filters_button()}
        {activeCount > 0 ? (
          <Badge variant="secondary">{activeCount}</Badge>
        ) : null}
        {open ? (
          <ChevronUpIcon className="size-3.5" />
        ) : (
          <ChevronDownIcon className="size-3.5" />
        )}
      </Button>
      <div
        id="my-schedule-more-filters"
        className={cn(
          'col-span-2 grid-cols-2 items-end gap-3 md:contents',
          open ? 'grid' : 'hidden',
        )}
      >
        <div
          className={cn(
            'flex min-w-0 flex-col gap-1',
            options.ministries.length > 1 || 'col-span-2',
          )}
        >
          <Label htmlFor="my-schedule-filter-month">
            {m.my_schedule_filter_month()}
          </Label>
          <Select
            value={month}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({
                ...filters,
                month: !value || value === ANY ? undefined : value,
              })
            }
          >
            <SelectTrigger
              id="my-schedule-filter-month"
              className="min-h-11 w-full md:min-h-0 md:w-44"
            >
              <SelectValue>
                {month === ANY
                  ? m.my_schedule_filter_all_months()
                  : monthLabel(month)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>
                {m.my_schedule_filter_all_months()}
              </SelectItem>
              {options.months.map((value) => (
                <SelectItem key={value} value={value}>
                  {monthLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {options.ministries.length > 1 ? (
          <div className="flex min-w-0 flex-col gap-1">
            <Label htmlFor="my-schedule-filter-ministry">
              {m.my_schedule_filter_ministry()}
            </Label>
            <Select
              value={ministryId}
              disabled={disabled}
              onValueChange={(value) =>
                onChange({
                  ...filters,
                  ministryId: !value || value === ANY ? undefined : value,
                })
              }
            >
              <SelectTrigger
                id="my-schedule-filter-ministry"
                className="min-h-11 w-full md:min-h-0 md:w-48"
              >
                <SelectValue>
                  {options.ministries.find((x) => x.id === ministryId)?.name ??
                    m.my_schedule_filter_all_ministries()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>
                  {m.my_schedule_filter_all_ministries()}
                </SelectItem>
                {options.ministries.map((ministry) => (
                  <SelectItem key={ministry.id} value={ministry.id}>
                    {ministry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {/* The cycle builder's toggle group: a fieldset names the toggles, each one pressed or not. */}
        <fieldset className="col-span-2 space-y-1">
          <legend className="flex select-none items-center gap-2 text-xs leading-none">
            {m.my_schedule_group_by()}
          </legend>
          <div className="flex gap-1">
            {GROUP_LEVELS.map((level) => (
              <Button
                key={level}
                type="button"
                variant={levels.includes(level) ? 'secondary' : 'ghost'}
                aria-pressed={levels.includes(level)}
                className="min-h-11 md:min-h-0"
                onClick={() => toggle(level)}
              >
                {groupLevelName(level)}
              </Button>
            ))}
          </div>
        </fieldset>
      </div>
    </form>
  );
}

interface MinistrySchedulesProps {
  schedules: MinistrySchedule[];
}

function MinistrySchedules({ schedules }: MinistrySchedulesProps) {
  return (
    <Card className="surface-panel">
      <CardHeader>
        <h2 id="ministry-schedules" className="workspace-section-title">
          {m.my_schedule_ministries_heading()}
        </h2>
        <p className="text-muted-foreground text-sm">
          {m.my_schedule_ministries_description()}
        </p>
      </CardHeader>
      <CardContent>
        <ul className="-mx-2 grid">
          {schedules.map((s) => (
            <li key={`${s.ministryId}:${s.cycleId}`}>
              <Link
                to="/app/my-schedule/$ministryId/$cycleId"
                params={{ ministryId: s.ministryId, cycleId: s.cycleId }}
                className="radius-control flex min-h-11 items-center gap-2 px-2 py-2 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1 break-words">
                  <span className="font-medium">{s.ministryName}</span>{' '}
                  <span className="text-muted-foreground">· {s.cycleName}</span>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

interface MyScheduleIntroProps {
  counts?: GetPublishedVolunteerSchedule200['counts'];
}

function MyScheduleIntro({ counts }: MyScheduleIntroProps) {
  return (
    <WorkspaceIntroPanel
      title={m.nav_my_schedule()}
      description={m.my_schedule_description()}
      autoFocusTitle
      aside={
        counts ? (
          <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
            <HeaderStatChip
              testId="my-schedule-upcoming-chip"
              label={m.my_schedule_count_upcoming()}
              value={counts.upcoming}
            />
            <HeaderStatChip
              testId="my-schedule-this-month-chip"
              label={m.my_schedule_count_this_month()}
              value={counts.thisMonth}
            />
            <HeaderStatChip
              testId="my-schedule-swaps-chip"
              label={m.my_schedule_count_swaps()}
              value={counts.openSwaps}
            />
          </div>
        ) : undefined
      }
    />
  );
}

function EmptySchedule() {
  return (
    <div className="space-y-2" role="status">
      <p className="text-muted-foreground">{m.my_schedule_empty()}</p>
      <Link
        to="/app/availability"
        className={buttonVariants({
          variant: 'outline',
          className: 'min-h-11 md:min-h-0',
        })}
      >
        {m.my_schedule_empty_availability()}
      </Link>
    </div>
  );
}

interface FilteredEmptyProps {
  onClear: () => void;
}

function FilteredEmpty({ onClear }: FilteredEmptyProps) {
  return (
    <div className="space-y-2" role="status">
      <p className="text-muted-foreground">{m.my_schedule_empty_filtered()}</p>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 md:min-h-0"
        onClick={onClear}
      >
        {m.invitations_clear_filters()}
      </Button>
    </div>
  );
}

/** The filters the server applies; grouping is the page's own. */
function listFilters({ search, month, ministryId }: MyScheduleFilters) {
  return { search, month, ministryId };
}

interface MyScheduleProps {
  data: CachedMySchedule;
  filters: MyScheduleFilters;
  onFiltersChange: (filters: MyScheduleFilters) => void;
  /** The list on screen is the previous filters', kept while the new one loads. */
  isStale: boolean;
  lastUpdatedAt: string;
  isCached: boolean;
  isRefreshError: boolean;
  onRefresh: () => Promise<void>;
}

function MySchedule({
  data,
  filters,
  onFiltersChange,
  isStale,
  lastUpdatedAt,
  isCached,
  isRefreshError,
  onRefresh,
}: MyScheduleProps) {
  const { churchTimezone: timeZone } = useTimezone();
  const refresh = useMyScheduleRefresh({
    onRefresh,
    visibleData: { assignments: data.assignments, schedules: data.schedules },
    scopeKey: JSON.stringify(listFilters(filters)),
    isStale,
  });
  // A failed background refetch keeps the retained schedule and says so in the banner.
  const refreshState =
    refresh.refreshState === 'idle' && isRefreshError
      ? 'error'
      : refresh.refreshState;
  const levels = groupLevels(filters);
  const rows = toListRows({
    rows: toDayRows({ assignments: data.assignments, timeZone }),
    levels,
  });
  // The read holds only upcoming and running Assignments, soonest first; copies stored before `next` existed are unfiltered.
  const nextAssignment =
    data.next === undefined ? data.assignments[0] : data.next;
  const [next] = nextAssignment
    ? toDayRows({ assignments: [nextAssignment], timeZone })
    : [];
  const ministryCount =
    data.options?.ministries.length ??
    new Set(data.assignments.map((a) => a.ministryId)).size;
  const context: RowContext = { timeZone, showMinistry: ministryCount > 1 };
  return (
    <WorkspacePage>
      <BackgroundRefreshIndicator
        visible={refresh.hasBackgroundUpdate}
        onDismiss={refresh.dismissBackgroundUpdate}
      />
      <MyScheduleOfflineBanner
        isOffline={!refresh.isOnline}
        isUsingCachedData={refresh.isUsingCachedData || isCached}
        lastUpdatedAt={lastUpdatedAt}
        onRefresh={refresh.refresh}
        refreshState={refreshState}
      />
      <MyScheduleIntro counts={data.counts} />
      {/* Phone: next shift, the list, the full schedules. Tablet and laptop:
          next shift and full schedules side by side above the table. Wide
          screens: the table with both in a side column. */}
      <div className="grid gap-4 md:grid-cols-2 md:items-start 2xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-rows-[auto_1fr]">
        {next ? (
          <div className="md:col-start-1 md:row-start-1 2xl:col-start-2">
            <NextAssignment row={next} {...context} />
          </div>
        ) : null}
        <div className="min-w-0 space-y-4 md:col-span-2 md:row-start-2 2xl:col-span-1 2xl:col-start-1 2xl:row-span-2 2xl:row-start-1">
          {next && data.options ? (
            <FilterBar
              filters={filters}
              options={data.options}
              disabled={!refresh.isOnline}
              onChange={onFiltersChange}
            />
          ) : null}
          {!next ? (
            <EmptySchedule />
          ) : rows.length === 0 ? (
            <FilteredEmpty
              onClear={() => onFiltersChange({ group: filters.group })}
            />
          ) : (
            <Card
              className={cn(
                'surface-panel transition-opacity',
                isStale && 'opacity-60',
              )}
              aria-busy={isStale || undefined}
            >
              <CardContent>
                <UpcomingTable rows={rows} levels={levels} {...context} />
              </CardContent>
            </Card>
          )}
        </div>
        {data.schedules.length > 0 ? (
          <div className="md:col-start-2 md:row-start-1 2xl:row-start-2">
            <MinistrySchedules schedules={data.schedules} />
          </div>
        ) : null}
      </div>
    </WorkspacePage>
  );
}

interface MySchedulePageProps {
  /** The route's search params; the page never keeps its own copy. */
  filters: MyScheduleFilters;
  onFiltersChange: (filters: MyScheduleFilters) => void;
}

export function MySchedulePage({
  filters,
  onFiltersChange,
}: MySchedulePageProps) {
  const isOnline = useOnlineState();
  const callerScope = useCallerCapabilitiesScope();
  const { churchId = null, userId = null } = callerScope ?? {};
  // Offline only the stored, unfiltered copy exists, so the filters wait for the connection.
  const params = isOnline ? listFilters(filters) : {};
  const filtered = Object.values(params).some(Boolean);
  // Only the whole schedule is stored for offline use.
  const cacheScope =
    churchId && userId && !filtered ? { userId, churchId } : null;
  const cached = cachedReadOptions({
    scope: cacheScope,
    key: 'schedule',
    isOnline,
    schema: cachedMyScheduleSchema,
  });
  const query = useQuery({
    queryKey: ['my-schedule', userId, churchId, params],
    // The read time rides with the data so a cached copy reports when it was fetched.
    queryFn: () =>
      fetchAndCache({
        scope: cacheScope,
        key: 'schedule',
        fetch: async () => {
          const schedule =
            await volunteerApi.getPublishedVolunteerSchedule(params);
          return { ...schedule, fetchedAt: now() };
        },
      }),
    ...cached,
    // A new filter keeps the last list on screen, dimmed, until its read lands.
    placeholderData: filtered ? keepPreviousData : cached.placeholderData,
  });
  if (query.isLoading)
    return (
      <WorkspacePage>
        <MyScheduleIntro />
        <Pending label={m.my_schedule_loading()} className="grid gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </Pending>
      </WorkspacePage>
    );
  // Retained data stays on screen when a refetch fails; the full error is for no data.
  if (query.isError && !query.data) {
    // The server's membership refusal mirrors the gate's not-serving state.
    if (isAxiosError(query.error) && query.error.response?.status === 403)
      return <p role="status">{m.shell_not_serving()}</p>;
    return (
      <WorkspacePage>
        <MyScheduleIntro />
        <Alert variant="destructive">
          <AlertDescription className="flex items-center gap-3">
            <span>{m.my_schedule_load_error()}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => query.refetch()}
            >
              {m.schedules_retry()}
            </Button>
          </AlertDescription>
        </Alert>
      </WorkspacePage>
    );
  }
  return query.data ? (
    <MySchedule
      data={query.data}
      filters={filters}
      onFiltersChange={onFiltersChange}
      isStale={query.isPlaceholderData && filtered}
      lastUpdatedAt={query.data.fetchedAt}
      isCached={query.isPlaceholderData || !isOnline}
      isRefreshError={query.isRefetchError}
      onRefresh={async () => {
        await query.refetch({ throwOnError: true });
      }}
    />
  ) : null;
}
