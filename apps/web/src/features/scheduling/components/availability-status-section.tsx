import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { appConfig } from '@church/app-config';
import { m } from '@church/i18n/messages';
import {
  compareInstants,
  formatTimeOfDay,
  millisecondsBetween,
  now,
  parseInstant,
  today,
} from '@church/time';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { CheckIcon, CircleIcon } from 'lucide-react';
import { memo, type ReactNode, useEffect, useId, useState } from 'react';
import { z } from 'zod';
import { DatePickerField } from '@/components/date-picker-field';
import { Button } from '@/components/ui/button';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';
import { Input } from '@/components/ui/input';
import { Pending } from '@/components/ui/pending';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { GetCycleAvailabilityStatus200StatusesItem } from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { useTimezone } from '@/shared/hooks/use-timezone';
import {
  churchTimeOfDay,
  formatCalendarDateOnly,
} from '@/shared/utils/church-time';
import { adminApi } from '@/utils/api-instances';

/** In "Todos" each group shows this many chips, so a large group stays a chunk, not a wall. */
const ALL_VIEW_GROUP_PREVIEW = 24;

function PartialAnswerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface AnswerDetailsChipProps {
  name: string;
  details: string;
  children: ReactNode;
}
function AnswerDetailsChip({
  name,
  details,
  children,
}: AnswerDetailsChipProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        openOnHover
        onFocus={(event) => {
          if (event.currentTarget.matches(':focus-visible')) setOpen(true);
        }}
        aria-label={`${name}: ${details}`}
        className="radius-control relative outline-none after:absolute after:inset-x-0 after:-inset-y-2 after:min-h-11 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </PopoverTrigger>
      <PopoverContent initialFocus={false}>{details}</PopoverContent>
    </Popover>
  );
}

const COOLDOWN_CLOCK_REFRESH_MS = 60_000;

const remindRefusalSchema = z.object({
  error: z.string(),
  message: z.string(),
  remindAvailableAt: z.iso.datetime().optional(),
});

interface ScheduleScope {
  cycleId: string;
  ministryId: string;
}

export interface AvailabilityStatusSectionProps extends ScheduleScope {
  readOnly?: boolean;
  compact?: boolean;
  headerSummary?: boolean;
  /** Page actions at the end of the bar: right of it on wide containers,
   * under it on narrow ones. */
  trailing?: ReactNode;
}

interface RosterSearchProps {
  committed: string;
  onCommit: (search: string) => void;
}

/** Its own state: a keystroke re-renders this field, not the chips; the read waits for a pause. */
function RosterSearch({ committed, onCommit }: RosterSearchProps) {
  const { search, setSearch, commitNow } = useDebouncedSearch({
    committed,
    onCommit: (commit) => onCommit(commit.search ?? ''),
  });
  return (
    <Input
      aria-label={m.answers_search()}
      placeholder={m.answers_search()}
      value={search}
      onChange={(event) => setSearch(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commitNow();
      }}
    />
  );
}

function AvailabilityStatusSectionView({
  cycleId,
  ministryId,
  readOnly = false,
  compact = false,
  headerSummary = false,
  trailing,
}: AvailabilityStatusSectionProps) {
  const queryClient = useQueryClient();
  const deadlineLabelId = useId();
  const queryKey = ['availability-status', cycleId, ministryId];
  const deadlineMutation = useMutation({
    mutationFn: (answerBy: string | null) =>
      adminApi.setAvailabilityDeadline(cycleId, { ministryId, answerBy }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  function refreshAnswers({ cycleId, ministryId }: ScheduleScope) {
    return queryClient.invalidateQueries({
      queryKey: ['availability-status', cycleId, ministryId],
    });
  }
  const remindMutation = useMutation({
    mutationFn: ({ cycleId, ministryId }: ScheduleScope) =>
      adminApi.remindSchedule(cycleId, { ministryId }),
    onSuccess: (_data, scope) => refreshAnswers(scope),
    onError: (_error, scope) => refreshAnswers(scope),
  });
  const statusQuery = useQuery({
    queryKey,
    queryFn: () =>
      adminApi.getCycleAvailabilityStatus(cycleId, { ministryId, limit: 1 }),
  });
  const { churchTimezone } = useTimezone();
  const { data } = statusQuery;
  const currentRemind =
    remindMutation.variables?.cycleId === cycleId &&
    remindMutation.variables.ministryId === ministryId;
  const remindPending = currentRemind && remindMutation.isPending;
  const remindError = currentRemind && remindMutation.isError;
  const errorData: unknown =
    currentRemind && isAxiosError<unknown>(remindMutation.error)
      ? remindMutation.error.response?.data
      : undefined;
  const parsedRefusal = remindRefusalSchema.safeParse(errorData);
  const refusal = parsedRefusal.success ? parsedRefusal.data : undefined;
  const refusedUntil =
    refusal?.error === 'REMIND_ON_COOLDOWN'
      ? refusal.remindAvailableAt
      : undefined;
  const cooldownInstants = [
    data?.remindAvailableAt,
    currentRemind ? remindMutation.data?.remindAvailableAt : undefined,
    refusedUntil,
  ]
    .filter((value) => value != null)
    .map((value) => parseInstant({ value }));
  const remindAvailableAt = cooldownInstants.sort().at(-1);
  const [currentInstant, setCurrentInstant] = useState(now);
  useEffect(() => {
    if (!remindAvailableAt) return;
    const availableAt = remindAvailableAt;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function refreshClock() {
      const current = now();
      setCurrentInstant(current);
      const remaining = millisecondsBetween({
        start: current,
        end: availableAt,
      });
      if (remaining > 0) {
        const delay = Math.min(remaining, COOLDOWN_CLOCK_REFRESH_MS);
        timer = setTimeout(refreshClock, delay);
      }
    }
    refreshClock();
    return () => clearTimeout(timer);
  }, [remindAvailableAt]);
  const coolingDown = remindAvailableAt
    ? compareInstants({ left: currentInstant, right: remindAvailableAt }) < 0
    : false;
  const cooldownWallTime = remindAvailableAt
    ? churchTimeOfDay({ value: remindAvailableAt, timeZone: churchTimezone })
    : undefined;
  const cooldownTime = cooldownWallTime
    ? formatTimeOfDay({ time: cooldownWallTime })
    : '';
  const churchDay = today({ instant: now(), timeZone: churchTimezone });
  const overdue = data?.answerBy && data.answerBy < churchDay;
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [activeGroup, setActiveGroup] = useState<
    'all' | 'pending' | 'available' | 'unavailable'
  >('all');
  const [rosterOpen, setRosterOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [editingDeadline, setEditingDeadline] = useState(false);
  const roster = useInfiniteQuery({
    queryKey: [...queryKey, 'roster', activeGroup, search],
    enabled: rosterOpen,
    placeholderData: keepPreviousData,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      adminApi.getCycleAvailabilityStatus(cycleId, {
        ministryId,
        status: activeGroup === 'all' ? undefined : activeGroup,
        q: search.trim() || undefined,
        cursor: pageParam,
        limit: appConfig.people.answersMaxPageSize,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  // Who the admin acts on first: partial answers, then the available, then
  // the (usually largest) pending group.
  const groups = [
    {
      id: 'unavailable',
      label: m.answers_unavailable(),
      count: data?.counts.unavailable ?? 0,
    },
    {
      id: 'available',
      label: m.answers_available(),
      count: data?.counts.available ?? 0,
    },
    {
      id: 'pending',
      label: m.answers_pending(),
      count: data?.counts.pending ?? 0,
    },
  ] as const;
  const people = roster.data?.pages.flatMap((page) => page.statuses) ?? [];
  const progress =
    data && data.asked > 0 ? (data.confirmed / data.asked) * 100 : 0;
  const countText = data
    ? data.confirmed === 1
      ? m.answers_count_one(data)
      : m.answers_count(data)
    : '';
  function answerDetails(status: GetCycleAvailabilityStatus200StatusesItem) {
    return status.state === 'confirmed' && status.unavailableShiftCount > 0
      ? status.shiftCount === 1
        ? m.answers_unavailable_count_one({
            unavailable: status.unavailableShiftCount,
            total: status.shiftCount,
          })
        : m.answers_unavailable_count({
            unavailable: status.unavailableShiftCount,
            total: status.shiftCount,
          })
      : null;
  }
  return (
    <FormControlSizeProvider size={isMobile ? 'touch' : 'default'}>
      <section
        data-testid="availability-status-list"
        aria-label={m.answers_title()}
        className="space-y-3"
      >
        {statusQuery.isLoading ? (
          <Pending label={m.answers_loading()}>
            <Skeleton className="h-16 w-full" />
          </Pending>
        ) : statusQuery.isError && !data ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 text-destructive text-sm"
          >
            {m.answers_error()}
            <Button variant="outline" onClick={() => statusQuery.refetch()}>
              {m.schedules_retry()}
            </Button>
          </div>
        ) : data ? (
          <>
            <div
              className={
                compact
                  ? 'flex flex-wrap items-center gap-2'
                  : 'surface-panel flex flex-wrap items-center gap-x-6 gap-y-3 p-3'
              }
            >
              {!compact ? (
                <div className="min-w-40 flex-1 space-y-2 max-md:basis-full">
                  <h2 className="flex flex-wrap items-baseline gap-x-2 font-medium text-sm">
                    {m.answers_title()}{' '}
                    <span className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {countText}
                    </span>
                  </h2>
                  <Progress
                    aria-label={m.answers_title()}
                    aria-valuetext={countText}
                    value={progress}
                  />
                </div>
              ) : (
                // The roster's group headings (h3) still sit under a section heading.
                <h2 className="sr-only">{m.answers_title()}</h2>
              )}
              {/* Every action of the bar, the page's too, in one row that wraps as one group. */}
              <div
                data-testid="availability-status-actions"
                className={cn(
                  'flex flex-wrap items-center justify-end gap-2',
                  compact && 'flex-1',
                )}
              >
                <Button
                  // Alone in the published row it needs a button's edge, like the actions beside it.
                  variant={compact ? 'outline' : 'ghost'}
                  className={compact ? 'mr-auto' : undefined}
                  aria-expanded={rosterOpen}
                  aria-controls={`${deadlineLabelId}-roster`}
                  onClick={() => setRosterOpen(!rosterOpen)}
                >
                  {m.answers_view_roster()}
                </Button>
                {!headerSummary && !editingDeadline ? (
                  <span className="text-muted-foreground text-sm">
                    {m.answers_deadline()}:{' '}
                    {data.answerBy ? (
                      <time dateTime={data.answerBy}>
                        {formatCalendarDateOnly({ value: data.answerBy })}
                      </time>
                    ) : (
                      m.answers_no_deadline()
                    )}
                    {overdue ? (
                      <span className="ml-2 text-destructive">
                        {m.answers_overdue()}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {!readOnly && !compact ? (
                  <>
                    <Button
                      variant="outline"
                      aria-expanded={editingDeadline}
                      onClick={() => setEditingDeadline(!editingDeadline)}
                    >
                      {m.answers_edit_deadline()}
                    </Button>
                    <Button
                      variant="outline"
                      data-testid="answers-remind"
                      // Cooling down reads as unavailable, yet stays focusable to announce why;
                      // same size and slot as Lembrar, the full sentence in its description. 75%: its time is information, kept AA-legible.
                      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-75"
                      disabled={remindPending}
                      aria-disabled={coolingDown || undefined}
                      aria-describedby={
                        coolingDown
                          ? `${deadlineLabelId}-remind-cooldown`
                          : undefined
                      }
                      title={
                        coolingDown
                          ? m.answers_remind_cooldown({ time: cooldownTime })
                          : undefined
                      }
                      onClick={() => {
                        if (!coolingDown)
                          remindMutation.mutate({ cycleId, ministryId });
                      }}
                    >
                      {remindPending
                        ? m.answers_remind_pending()
                        : coolingDown
                          ? m.answers_remind_at({ time: cooldownTime })
                          : m.answers_remind({
                              count: data.asked - data.confirmed,
                            })}
                    </Button>
                    {coolingDown ? (
                      <span
                        id={`${deadlineLabelId}-remind-cooldown`}
                        className="sr-only"
                      >
                        {m.answers_remind_cooldown({ time: cooldownTime })}
                      </span>
                    ) : null}
                  </>
                ) : null}
                {trailing}
              </div>
            </div>
            {editingDeadline && !readOnly ? (
              <div className="surface-subtle flex flex-wrap items-center gap-3 p-3">
                <span id={deadlineLabelId} className="text-sm">
                  {m.answers_deadline()}
                </span>
                <DatePickerField
                  value={data.answerBy ?? ''}
                  aria-labelledby={deadlineLabelId}
                  placeholder={m.answers_no_deadline()}
                  disabled={deadlineMutation.isPending}
                  onChange={(answerBy) => deadlineMutation.mutate(answerBy)}
                  onClear={() => deadlineMutation.mutate(null)}
                />
                {overdue ? (
                  <span className="text-destructive text-sm">
                    {m.answers_overdue()}
                  </span>
                ) : null}
                <p className="text-muted-foreground text-xs">
                  {m.answers_deadline_silent()}
                </p>
                {deadlineMutation.isError ? (
                  <p role="alert" className="text-destructive text-sm">
                    {m.answers_deadline_error()}
                  </p>
                ) : null}
              </div>
            ) : null}
            {!readOnly && remindError ? (
              <p role="alert" className="text-destructive text-sm">
                {refusedUntil && coolingDown
                  ? m.answers_remind_cooldown({ time: cooldownTime })
                  : (refusal?.message ?? m.answers_remind_error())}
              </p>
            ) : null}
            {data.asked === 0 ? (
              <p className="text-muted-foreground text-sm">
                {m.answers_empty()}
              </p>
            ) : null}
            {rosterOpen ? (
              <div
                id={`${deadlineLabelId}-roster`}
                className="surface-panel space-y-3 p-3"
                aria-busy={roster.isFetching}
              >
                <RadioGroup
                  aria-label={m.answers_view_roster()}
                  value={activeGroup}
                  onValueChange={(value) => {
                    if (
                      value === 'all' ||
                      value === 'pending' ||
                      value === 'available' ||
                      value === 'unavailable'
                    )
                      setActiveGroup(value);
                  }}
                  // Even rows on a phone: two segments per row, never a lone straggler.
                  className="radius-control flex w-full flex-wrap gap-1 bg-muted p-[3px] max-md:grid max-md:grid-cols-2"
                >
                  {[
                    { id: 'all', label: m.answers_all(), count: data.asked },
                    ...groups,
                  ].map((group) => (
                    <Radio.Root
                      key={group.id}
                      value={group.id}
                      className="radius-control inline-flex min-h-11 items-center gap-1.5 border border-transparent px-3 font-medium text-muted-foreground text-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-checked:border-border data-checked:bg-background data-checked:text-foreground md:min-h-8"
                    >
                      {group.id === 'pending' ? (
                        <CircleIcon className="size-3" aria-hidden="true" />
                      ) : group.id === 'available' ? (
                        <CheckIcon
                          className="size-3 text-green-800 dark:text-green-300"
                          aria-hidden="true"
                        />
                      ) : group.id === 'unavailable' ? (
                        <PartialAnswerIcon />
                      ) : null}
                      {group.label} · {group.count}
                    </Radio.Root>
                  ))}
                </RadioGroup>
                <RosterSearch committed={search} onCommit={setSearch} />
                {roster.isError ? (
                  <div
                    role="alert"
                    className="flex items-center gap-2 text-destructive text-sm"
                  >
                    {m.answers_error()}
                    <Button variant="outline" onClick={() => roster.refetch()}>
                      {m.schedules_retry()}
                    </Button>
                  </div>
                ) : null}
                {roster.isPending ? <Skeleton className="h-24 w-full" /> : null}
                {groups
                  .filter(
                    (group) =>
                      activeGroup === 'all' || activeGroup === group.id,
                  )
                  .map((group) => {
                    const members = people.filter(
                      (person) =>
                        group.id ===
                        (person.state !== 'confirmed'
                          ? 'pending'
                          : person.unavailableShiftCount > 0
                            ? 'unavailable'
                            : 'available'),
                    );
                    if (!members.length) return null;
                    const StatusIcon =
                      group.id === 'available'
                        ? CheckIcon
                        : group.id === 'unavailable'
                          ? PartialAnswerIcon
                          : CircleIcon;
                    return (
                      <div key={group.id} className="space-y-2">
                        {activeGroup === 'all' ? (
                          <h3 className="font-medium text-sm">
                            {group.label} · {group.count}
                          </h3>
                        ) : null}
                        <ul
                          className="flex flex-wrap gap-x-1.5 gap-y-2.5"
                          aria-label={group.label}
                        >
                          {(activeGroup === 'all'
                            ? members.slice(0, ALL_VIEW_GROUP_PREVIEW)
                            : members
                          ).map((person) => {
                            const details = answerDetails(person);
                            const chip = (
                              <span
                                className={cn(
                                  'radius-control inline-flex min-h-7 items-center gap-1.5 border px-2 py-1 text-xs',
                                  group.id === 'available'
                                    ? 'border-green-700/30 bg-green-500/10 text-green-800 dark:text-green-300'
                                    : group.id === 'unavailable'
                                      ? 'border-amber-700/30 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                                      : 'border-border text-foreground',
                                )}
                              >
                                <StatusIcon
                                  className="size-3 shrink-0"
                                  aria-hidden="true"
                                />
                                {person.volunteerName}
                                {details ? (
                                  <span className="text-amber-800 dark:text-amber-200">
                                    {m.answers_partial_short({
                                      count: person.unavailableShiftCount,
                                    })}
                                  </span>
                                ) : null}
                              </span>
                            );
                            return (
                              <li key={person.volunteerId}>
                                {details ? (
                                  <AnswerDetailsChip
                                    name={person.volunteerName}
                                    details={details}
                                  >
                                    {chip}
                                  </AnswerDetailsChip>
                                ) : (
                                  chip
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        {activeGroup === 'all' &&
                        group.count > ALL_VIEW_GROUP_PREVIEW ? (
                          // "Todos" previews each group; its own segment lists everyone.
                          <Button
                            variant="outline"
                            onClick={() => setActiveGroup(group.id)}
                          >
                            {m.answers_view_group({
                              group: group.label,
                              count: group.count,
                            })}
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                {!roster.isPending && people.length === 0 ? (
                  <p role="status" className="text-muted-foreground text-sm">
                    {m.shell_search_no_results()}
                  </p>
                ) : null}
                {roster.hasNextPage ? (
                  <Button
                    variant="outline"
                    disabled={roster.isFetchingNextPage}
                    onClick={() => roster.fetchNextPage()}
                  >
                    {m.answers_load_more()}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
        {trailing && !data ? (
          // The page's actions never wait on, or fail with, the answers read.
          <div className="flex flex-wrap items-center justify-end gap-2">
            {trailing}
          </div>
        ) : null}
      </section>
    </FormControlSizeProvider>
  );
}

/** Memoised: the prepare page re-renders on every filter change. */
export const AvailabilityStatusSection = memo(AvailabilityStatusSectionView);
