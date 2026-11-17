import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import {
  addCalendarDays,
  type CalendarDay,
  formatLongCalendarDay,
  now,
  parseCalendarDay,
  today,
} from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { HomeWidget } from '@/features/home/components/home-widget';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import type { ListAvailabilityChecks200ChecksItem } from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { useTimezone } from '@/shared/hooks/use-timezone';
import {
  dayOf,
  formatInstantRangeOf,
  formatTimeOf,
} from '@/shared/utils/church-time';
import { volunteerApi } from '@/utils/api-instances';

/** A deadline this many Church days away (or fewer) gets the accent. */
const DEADLINE_SOON_DAYS = 3;

function useVolunteerDashboard({ churchId, userId }: HomeSectionProps) {
  return useQuery({
    queryKey: homeSectionQueryKey({
      section: 'serving',
      churchId,
      userId,
      parts: ['dashboard'],
    }),
    queryFn: () => volunteerApi.getVolunteerDashboard(),
  });
}

function usePendingChecks({ churchId, userId }: HomeSectionProps) {
  const query = useQuery({
    queryKey: homeSectionQueryKey({
      section: 'serving',
      churchId,
      userId,
      parts: ['availability-checks'],
    }),
    queryFn: () => volunteerApi.listAvailabilityChecks(),
  });
  // shortcut: listAvailabilityChecks has no state filter, filtered client-side; move to a server param when the endpoint gets one
  const pending = (query.data?.checks ?? []).filter(
    (check) => check.state !== 'confirmed',
  );
  return { query, pending };
}

interface LongRangeInput {
  start: string;
  end: string;
  timeZone: string;
}

/** `domingo, 22 de novembro · 09:00–12:00`; a window ending on a later day names that day too. */
function formatLongRange({ start, end, timeZone }: LongRangeInput): string {
  const locale = getLocale();
  const startDay = dayOf({ value: start, timeZone });
  const endDay = dayOf({ value: end, timeZone });
  const endLabel =
    startDay === endDay
      ? formatTimeOf({ value: end, timeZone })
      : `${formatLongCalendarDay({ day: endDay, locale })} · ${formatTimeOf({ value: end, timeZone })}`;
  return `${formatLongCalendarDay({ day: startDay, locale })} · ${formatTimeOf({ value: start, timeZone })}–${endLabel}`;
}

export function NextAssignmentWidget(props: HomeSectionProps) {
  const { churchTimezone: timeZone } = useTimezone();
  const dashboard = useVolunteerDashboard(props);
  const { query: checks, pending } = usePendingChecks(props);
  const next = dashboard.data?.nextAssignment;
  // With no next assignment, stay silent unless nothing at all needs the volunteer.
  if (dashboard.isSuccess && !next && !(checks.isSuccess && !pending.length))
    return null;
  const needsResponse = next?.status === 'pending' && next.canRespond;
  return (
    <HomeWidget
      title={m.home_next_assignment()}
      error={
        dashboard.isError
          ? {
              message: m.my_schedule_load_error(),
              retry: () => dashboard.refetch(),
            }
          : undefined
      }
    >
      {dashboard.isPending ? (
        <Pending role="status" aria-label={m.my_schedule_loading()}>
          <Skeleton className="h-20 w-full" />
        </Pending>
      ) : next ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <Link
              to="/my-schedule/$assignmentId"
              params={{ assignmentId: next.assignmentId }}
              className="inline-flex min-h-11 items-center font-semibold text-2xl hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {next.eventTitle}
            </Link>
            <p className="text-lg">
              {formatLongRange({
                start: next.startTime,
                end: next.endTime,
                timeZone,
              })}
            </p>
            <p className="text-muted-foreground">
              {next.ministryName} · {next.sectorName} · {next.roleName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {needsResponse ? (
              <Link
                to="/my-schedule/$assignmentId"
                params={{ assignmentId: next.assignmentId }}
                className={buttonVariants({ size: 'touch' })}
              >
                {m.home_respond()}
              </Link>
            ) : null}
            <Badge variant="secondary">
              {next.timingState === 'in_progress'
                ? m.my_schedule_in_progress()
                : needsResponse
                  ? m.home_next_assignment_pending()
                  : m.home_next_assignment_answered()}
            </Badge>
          </div>
        </div>
      ) : (
        <p>{m.my_schedule_empty()}</p>
      )}
    </HomeWidget>
  );
}

interface CheckDeadlineProps {
  check: ListAvailabilityChecks200ChecksItem;
  churchDay: CalendarDay;
}

function CheckDeadline({ check, churchDay }: CheckDeadlineProps) {
  if (!check.answerBy) return null;
  const answerBy = parseCalendarDay({ value: check.answerBy.slice(0, 10) });
  const date = formatLongCalendarDay({ day: answerBy, locale: getLocale() });
  const overdue = answerBy < churchDay;
  const soon =
    !overdue &&
    answerBy <= addCalendarDays({ day: churchDay, days: DEADLINE_SOON_DAYS });
  return (
    <p
      className={cn(
        overdue
          ? 'font-medium text-destructive'
          : soon
            ? 'font-medium text-primary'
            : 'text-muted-foreground',
      )}
    >
      <time dateTime={check.answerBy}>
        {overdue
          ? m.availability_list_overdue({ date })
          : m.availability_list_answer_by({ date })}
      </time>
    </p>
  );
}

export function PendingChecksWidget(props: HomeSectionProps) {
  const { churchTimezone: timeZone } = useTimezone();
  const churchDay = today({ instant: now(), timeZone });
  const { query, pending } = usePendingChecks(props);
  if (query.isSuccess && !pending.length) return null;
  return (
    <HomeWidget
      title={m.home_pending_checks()}
      error={
        query.isError
          ? {
              message: m.availability_list_error(),
              retry: () => query.refetch(),
            }
          : undefined
      }
    >
      {query.isPending ? (
        <Pending role="status" aria-label={m.availability_list_loading()}>
          <Skeleton className="h-20 w-full" />
        </Pending>
      ) : (
        <ul className="divide-y">
          {pending.map((check) => (
            <li key={check.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
              <p className="font-semibold">
                {check.ministryName} · {check.cycleName}
              </p>
              <CheckDeadline check={check} churchDay={churchDay} />
              <Link
                to="/availability/$checkId"
                params={{ checkId: check.id }}
                className={buttonVariants({ size: 'touch' })}
              >
                {m.home_answer_availability()}
                <span className="sr-only">
                  {' '}
                  · {check.ministryName} · {check.cycleName}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HomeWidget>
  );
}

/** Next assignment and open checks share a row on desktop; either takes the full row when the other renders nothing. */
export function ServingActionsWidget(props: HomeSectionProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <div className="min-w-0 flex-1 empty:hidden">
        <NextAssignmentWidget {...props} />
      </div>
      <div className="min-w-0 flex-1 empty:hidden">
        <PendingChecksWidget {...props} />
      </div>
    </div>
  );
}

export function UpcomingAssignmentsWidget(props: HomeSectionProps) {
  const { churchTimezone: timeZone } = useTimezone();
  const dashboard = useVolunteerDashboard(props);
  const nextId = dashboard.data?.nextAssignment?.assignmentId;
  // Presentation dedupe only: the next assignment already has its own widget; server order is kept.
  const rows = (dashboard.data?.upcomingAssignmentGroups ?? []).flatMap(
    (group) =>
      group.assignments
        .filter((assignment) => assignment.assignmentId !== nextId)
        .map((assignment) => ({ group, assignment })),
  );
  if (!rows.length) return null;
  return (
    <HomeWidget
      title={m.home_upcoming_assignments()}
      action={
        <Link
          to="/my-schedule"
          className="inline-flex min-h-11 items-center underline"
        >
          {m.home_see_all()}
        </Link>
      }
    >
      <ul className="divide-y">
        {rows.map(({ group, assignment }) => (
          <li key={assignment.assignmentId}>
            <Link
              to="/my-schedule/$assignmentId"
              params={{ assignmentId: assignment.assignmentId }}
              className="-mx-2 block min-h-11 rounded-md px-2 py-3 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            >
              {group.eventTitle} ·{' '}
              {formatInstantRangeOf({
                start: assignment.startTime,
                end: assignment.endTime,
                timeZone,
              })}{' '}
              · {assignment.sectorName} · {assignment.roleName}
              {assignment.status === 'declined' ? (
                <Badge variant="outline" className="ml-2">
                  {m.home_assignment_declined()}
                </Badge>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </HomeWidget>
  );
}
