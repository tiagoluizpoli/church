import { m } from '@church/i18n/messages';
import { compareInstants, now, parseInstant } from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { useMyScheduleRefresh } from '../hooks/use-my-schedule-refresh';
import { useOnlineState } from '../hooks/use-online-state';
import { assignmentDayLabel } from '../lib/assignment-day-label';
import { cachedReadOptions, fetchAndCache } from '../lib/my-schedule-cache';
import { cachedMyScheduleSchema } from '../lib/my-schedule-schemas';
import { BackgroundRefreshIndicator } from './background-refresh-indicator';
import { MyScheduleOfflineBanner } from './my-schedule-offline-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  GetPublishedVolunteerSchedule200,
  GetPublishedVolunteerSchedule200AssignmentsItem as ScheduleAssignment,
} from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { dayOf, formatTimeOf } from '@/shared/utils/church-time';
import { volunteerApi } from '@/utils/api-instances';

interface DayGroup {
  day: string;
  label: string;
  assignments: ScheduleAssignment[];
}

// The read is already ordered by start; consecutive same-day items share a group.
interface GroupByDayInput {
  assignments: ScheduleAssignment[];
  timeZone: string;
}

function groupByDay({ assignments, timeZone }: GroupByDayInput): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const assignment of assignments) {
    const day = dayOf({ value: assignment.startTime, timeZone });
    const last = groups.at(-1);
    if (last?.day === day) last.assignments.push(assignment);
    else
      groups.push({
        day,
        label: assignmentDayLabel({
          startTime: assignment.startTime,
          timeZone,
        }),
        assignments: [assignment],
      });
  }
  return groups;
}

interface MyScheduleProps {
  data: GetPublishedVolunteerSchedule200;
  lastUpdatedAt: string;
  isCached: boolean;
  isRefreshError: boolean;
  onRefresh: () => Promise<void>;
}

function MySchedule({
  data,
  lastUpdatedAt,
  isCached,
  isRefreshError,
  onRefresh,
}: MyScheduleProps) {
  const { churchTimezone: timeZone } = useTimezone();
  const refresh = useMyScheduleRefresh({
    onRefresh,
    visibleData: { assignments: data.assignments, schedules: data.schedules },
  });
  const current = now();
  // A failed background refetch keeps the retained schedule and says so in the banner.
  const refreshState =
    refresh.refreshState === 'idle' && isRefreshError
      ? 'error'
      : refresh.refreshState;
  const groups = groupByDay({ assignments: data.assignments, timeZone });
  return (
    <div className="space-y-8">
      <h1 className="font-semibold text-xl">{m.nav_my_schedule()}</h1>
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
      <section aria-labelledby="my-assignments" className="space-y-4">
        <h2 id="my-assignments" className="font-semibold">
          {m.my_schedule_assignments_heading()}
        </h2>
        {groups.length === 0 ? <p>{m.my_schedule_empty()}</p> : null}
        {groups.map((group) => (
          <div key={group.day} className="space-y-2">
            <h3 className="text-muted-foreground text-sm">{group.label}</h3>
            <ul className="space-y-2">
              {group.assignments.map((a) => {
                const start = parseInstant({ value: a.startTime });
                const end = parseInstant({ value: a.endTime });
                const inProgress =
                  compareInstants({ left: start, right: current }) <= 0 &&
                  compareInstants({ left: current, right: end }) < 0;
                return (
                  <li key={a.assignmentId}>
                    <Link
                      to="/my-schedule/$assignmentId"
                      params={{ assignmentId: a.assignmentId }}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                    >
                      <span>
                        {group.label} ·{' '}
                        {formatTimeOf({ value: a.startTime, timeZone })}–
                        {formatTimeOf({ value: a.endTime, timeZone })} ·{' '}
                        {a.ministryName} · {a.roleName} · {a.sectorName}
                      </span>
                      {inProgress ? (
                        <Badge>{m.my_schedule_in_progress()}</Badge>
                      ) : null}
                      {a.swapRequested ? (
                        <Badge variant="outline">
                          {m.my_schedule_swap_requested()}
                        </Badge>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
      <section aria-labelledby="ministry-schedules" className="space-y-3">
        <h2 id="ministry-schedules" className="font-semibold">
          {m.my_schedule_ministries_heading()}
        </h2>
        {data.schedules.length === 0 ? (
          <p>{m.my_schedule_no_schedules()}</p>
        ) : (
          <ul className="space-y-2">
            {data.schedules.map((s) => (
              <li key={`${s.ministryId}:${s.cycleId}`}>
                <Link
                  to="/my-schedule/$ministryId/$cycleId"
                  params={{ ministryId: s.ministryId, cycleId: s.cycleId }}
                  className="block rounded-md border p-3"
                >
                  {s.ministryName} · {s.cycleName}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function MySchedulePage() {
  const isOnline = useOnlineState();
  const callerScope = useCallerCapabilitiesScope();
  const { churchId = null, userId = null } = callerScope ?? {};
  const cacheScope = churchId && userId ? { userId, churchId } : null;
  const query = useQuery({
    queryKey: ['my-schedule', userId, churchId],
    // The read time rides with the data so a cached copy reports when it was fetched.
    queryFn: () =>
      fetchAndCache({
        scope: cacheScope,
        key: 'schedule',
        fetch: async () => {
          const schedule = await volunteerApi.getPublishedVolunteerSchedule();
          return { ...schedule, fetchedAt: now() };
        },
      }),
    retry: false,
    ...cachedReadOptions({
      scope: cacheScope,
      key: 'schedule',
      isOnline,
      schema: cachedMyScheduleSchema,
    }),
  });
  if (query.isLoading)
    return (
      <div role="status" aria-label={m.my_schedule_loading()}>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  // Retained data stays on screen when a refetch fails; the full error is for no data.
  if (query.isError && !query.data) {
    // The server's membership refusal mirrors the gate's not-serving state.
    if (isAxiosError(query.error) && query.error.response?.status === 403)
      return <p role="status">{m.shell_not_serving()}</p>;
    return (
      <div role="alert" className="space-y-3 text-destructive">
        <p>{m.my_schedule_load_error()}</p>
        <Button variant="outline" size="touch" onClick={() => query.refetch()}>
          {m.schedules_retry()}
        </Button>
      </div>
    );
  }
  return query.data ? (
    <MySchedule
      data={query.data}
      lastUpdatedAt={query.data.fetchedAt}
      isCached={query.isPlaceholderData || !isOnline}
      isRefreshError={query.isRefetchError}
      onRefresh={async () => {
        await query.refetch({ throwOnError: true });
      }}
    />
  ) : null;
}
