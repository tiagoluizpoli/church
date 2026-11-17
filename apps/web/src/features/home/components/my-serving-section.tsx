import { m } from '@church/i18n/messages';
import { now, today } from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { HomeError } from '@/features/home/components/home-error';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { HomeWidget } from '@/features/home/components/home-widget';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import { CheckDeadline } from '@/features/volunteers/components/check-deadline';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantRangeOf } from '@/shared/utils/church-time';
import { volunteerApi } from '@/utils/api-instances';

export function MyServingSection({ churchId, userId }: HomeSectionProps) {
  const { churchTimezone: timeZone } = useTimezone();
  const churchDay = today({ instant: now(), timeZone });
  const checks = useQuery({
    queryKey: homeSectionQueryKey({
      section: 'serving',
      churchId,
      userId,
      parts: ['availability-checks'],
    }),
    queryFn: () => volunteerApi.listAvailabilityChecks(),
    retry: false,
  });
  const dashboard = useQuery({
    queryKey: homeSectionQueryKey({
      section: 'serving',
      churchId,
      userId,
      parts: ['dashboard'],
    }),
    queryFn: () => volunteerApi.getVolunteerDashboard(),
    retry: false,
  });
  // shortcut: listAvailabilityChecks has no state filter, filtered client-side; move to a server param when the endpoint gets one
  const pending = (checks.data?.checks ?? []).filter(
    (check) => check.state !== 'confirmed',
  );
  const next = dashboard.data?.nextAssignment;
  return (
    <HomeWidget title={m.home_section_serving()}>
      {dashboard.isPending ? (
        <p role="status">{m.my_schedule_loading()}</p>
      ) : dashboard.isError ? (
        <HomeError
          message={m.my_schedule_load_error()}
          onRetry={() => dashboard.refetch()}
        />
      ) : next ? (
        <div className="space-y-2">
          <h3 className="font-semibold">{m.home_next_assignment()}</h3>
          <Link
            to="/my-schedule/$assignmentId"
            params={{ assignmentId: next.assignmentId }}
            className="block min-h-11 rounded-md border p-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="block font-semibold">{next.eventTitle}</span>
            <span className="block">
              {formatInstantRangeOf({
                start: next.startTime,
                end: next.endTime,
                timeZone,
              })}
            </span>
            <span className="block">
              {next.ministryName} · {next.sectorName} · {next.roleName}
            </span>
            <Badge variant="secondary">
              {next.timingState === 'in_progress'
                ? m.my_schedule_in_progress()
                : next.status === 'pending' && next.canRespond
                  ? m.home_next_assignment_pending()
                  : m.home_next_assignment_answered()}
            </Badge>
          </Link>
        </div>
      ) : checks.isSuccess && pending.length === 0 ? (
        <p>{m.my_schedule_empty()}</p>
      ) : null}
      {checks.isPending ? (
        <p role="status">{m.availability_list_loading()}</p>
      ) : checks.isError ? (
        <HomeError
          message={m.availability_list_error()}
          onRetry={() => checks.refetch()}
        />
      ) : pending.length ? (
        <div className="space-y-2">
          <h3 className="font-semibold">{m.home_pending_checks()}</h3>
          <ul className="space-y-2">
            {pending.map((check) => (
              <li key={check.id}>
                <Link
                  to="/availability/$checkId"
                  params={{ checkId: check.id }}
                  className="block min-h-11 rounded-md border p-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="block font-semibold">
                    {check.ministryName} · {check.cycleName}
                  </span>
                  <CheckDeadline check={check} churchDay={churchDay} />
                  <span className="underline">
                    {m.home_answer_availability()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {dashboard.data?.upcomingAssignmentGroups.length ? (
        <div className="space-y-2">
          <h3 className="font-semibold">{m.home_upcoming_assignments()}</h3>
          <ul className="space-y-2">
            {dashboard.data.upcomingAssignmentGroups.map((group) =>
              group.assignments.map((assignment) => (
                <li key={assignment.assignmentId}>
                  <Link
                    to="/my-schedule/$assignmentId"
                    params={{ assignmentId: assignment.assignmentId }}
                    className="block min-h-11 rounded-md border p-3 hover:bg-accent"
                  >
                    {group.eventTitle} ·{' '}
                    {formatInstantRangeOf({
                      start: assignment.startTime,
                      end: assignment.endTime,
                      timeZone,
                    })}{' '}
                    · {assignment.sectorName} · {assignment.roleName}
                  </Link>
                </li>
              )),
            )}
          </ul>
          <Link
            to="/my-schedule"
            className="inline-flex min-h-11 items-center underline"
          >
            {m.home_see_all()}
          </Link>
        </div>
      ) : null}
    </HomeWidget>
  );
}
