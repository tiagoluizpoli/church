import { m } from '@church/i18n/messages';
import { compareInstants, now, parseInstant } from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { useMemo } from 'react';
import { useMyScheduleRefresh } from '../hooks/use-my-schedule-refresh';
import { assignmentDayLabel } from '../lib/assignment-day-label';
import { BackgroundRefreshIndicator } from './background-refresh-indicator';
import { MyScheduleOfflineBanner } from './my-schedule-offline-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  GetPublishedVolunteerSchedule200,
  GetPublishedVolunteerSchedule200AssignmentsItem as ScheduleAssignment,
} from '@/infrastructure/api/churchAPI.schemas';
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
  dataUpdatedAt: number;
  onRefresh: () => Promise<void>;
}

function MySchedule({ data, dataUpdatedAt, onRefresh }: MyScheduleProps) {
  // Stamp the read time as an Instant whenever a fetch lands (dataUpdatedAt changes).
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataUpdatedAt is the refetch trigger
  const lastUpdatedAt = useMemo(() => now(), [dataUpdatedAt]);
  const refresh = useMyScheduleRefresh({
    onRefresh,
    visibleData: { assignments: data.assignments, schedules: data.schedules },
  });
  const { churchTimezone: timeZone } = useTimezone();
  const current = now();
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
        isUsingCachedData={refresh.isUsingCachedData}
        lastUpdatedAt={lastUpdatedAt}
        onRefresh={refresh.refresh}
        refreshState={refresh.refreshState}
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
                const inProgress =
                  compareInstants({
                    left: parseInstant({ value: a.startTime }),
                    right: current,
                  }) <= 0 &&
                  compareInstants({
                    left: current,
                    right: parseInstant({ value: a.endTime }),
                  }) < 0;
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
  const query = useQuery({
    queryKey: ['my-schedule'],
    queryFn: () => volunteerApi.getPublishedVolunteerSchedule(),
    retry: false,
  });
  if (query.isLoading)
    return (
      <div role="status" aria-label={m.my_schedule_loading()}>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (query.isError) {
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
      dataUpdatedAt={query.dataUpdatedAt}
      onRefresh={async () => {
        await query.refetch({ throwOnError: true });
      }}
    />
  ) : null;
}
