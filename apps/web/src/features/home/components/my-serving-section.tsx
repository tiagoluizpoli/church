import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import {
  addCalendarDays,
  type CalendarDay,
  calendarDaysBetween,
  formatLongCalendarDay,
  formatMonthShort,
  now,
  parseCalendarDay,
  today,
} from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarCheck, ChevronRight, CircleCheck, Clock } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  HomeReadProps,
  HomeSectionProps,
} from '@/features/home/components/home-section-props';
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

export function usePendingChecks({
  churchId,
  userId,
  enabled = true,
}: HomeReadProps) {
  const query = useQuery({
    queryKey: homeSectionQueryKey({
      section: 'serving',
      churchId,
      userId,
      parts: ['availability-checks'],
    }),
    queryFn: () => volunteerApi.listAvailabilityChecks(),
    enabled,
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

interface CountdownInput {
  start: string;
  timeZone: string;
}

function countdown({ start, timeZone }: CountdownInput): string {
  const days = calendarDaysBetween({
    start: today({ instant: now(), timeZone }),
    end: dayOf({ value: start, timeZone }),
  });
  if (days <= 0) return m.home_next_today();
  if (days === 1) return m.home_next_tomorrow();
  return m.home_next_in_days({ count: days });
}

export function NextAssignmentWidget(props: HomeSectionProps) {
  const { churchTimezone: timeZone } = useTimezone();
  const dashboard = useVolunteerDashboard(props);
  const next = dashboard.data?.nextAssignment;
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
        <Pending label={m.my_schedule_loading()}>
          <Skeleton className="h-28 w-full" />
        </Pending>
      ) : next ? (
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <DateTile day={dayOf({ value: next.startTime, timeZone })} large />
            <div className="min-w-0 space-y-0.5">
              <Link
                to="/app/my-schedule/$assignmentId"
                params={{ assignmentId: next.assignmentId }}
                className="inline-flex items-center font-semibold text-2xl tracking-tight hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                {next.eventTitle}
              </Link>
              <p>
                {formatLongRange({
                  start: next.startTime,
                  end: next.endTime,
                  timeZone,
                })}
              </p>
              <p className="text-muted-foreground text-sm">
                {next.ministryName} · {next.sectorName} · {next.roleName}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <span className="radius-control inline-flex items-center gap-1.5 bg-primary/8 px-2.5 py-1 font-medium text-primary text-sm">
              <Clock aria-hidden className="size-3.5" />
              {next.timingState === 'in_progress'
                ? m.my_schedule_in_progress()
                : countdown({ start: next.startTime, timeZone })}
            </span>
            <Link
              to="/app/my-schedule/$assignmentId"
              params={{ assignmentId: next.assignmentId }}
              className={cn(buttonVariants({ size: 'touch' }), 'ml-auto')}
            >
              {m.home_open_assignment()}
            </Link>
          </div>
        </div>
      ) : null}
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
    <span
      className={cn(
        'block text-sm',
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
    </span>
  );
}

export function PendingChecksWidget(props: HomeSectionProps) {
  const { churchTimezone: timeZone } = useTimezone();
  const churchDay = today({ instant: now(), timeZone });
  const { query, pending } = usePendingChecks(props);
  return (
    <HomeWidget
      title={m.home_pending_checks()}
      action={
        pending.length ? (
          <Badge className="tabular-nums">{pending.length}</Badge>
        ) : null
      }
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
        <Pending label={m.availability_list_loading()}>
          <Skeleton className="h-28 w-full" />
        </Pending>
      ) : (
        <ul className="space-y-2">
          {pending.map((check) => (
            <li key={check.id}>
              <Link
                to="/app/availability/$checkId"
                params={{ checkId: check.id }}
                className="radius-control group flex min-h-14 items-center gap-3 border px-3 py-2.5 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="radius-icon flex size-9 shrink-0 items-center justify-center bg-primary/8 text-primary">
                  <CalendarCheck aria-hidden className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block truncate font-medium">
                    {check.ministryName} · {check.cycleName}
                  </span>
                  <CheckDeadline check={check} churchDay={churchDay} />
                </span>
                <span className="sr-only">{m.home_answer_availability()}</span>
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HomeWidget>
  );
}

interface UpcomingRowsInput {
  data: ReturnType<typeof useVolunteerDashboard>['data'];
}

/** Upcoming assignments other than the next one, which has its own widget; server order is kept. */
function upcomingRows({ data }: UpcomingRowsInput) {
  const nextId = data?.nextAssignment?.assignmentId;
  return (data?.upcomingAssignmentGroups ?? []).flatMap((group) =>
    group.assignments
      .filter((assignment) => assignment.assignmentId !== nextId)
      .map((assignment) => ({ group, assignment })),
  );
}

/** Widgets pair up in rows, 7 + 5 columns; an unpaired last one takes the row. */
const PAIR_SPANS = ['lg:col-span-7', 'lg:col-span-5'];

/**
 * What the volunteer needs, in attention order: the next assignment as the
 * hero, availability to answer, then the rest of the upcoming assignments
 * (their serving history is its own widget, after any leader statistics). A
 * widget with nothing to show is left out, and when nothing waits one quiet
 * line says so instead of a row of empty boxes.
 */
export function ServingActionsWidget(props: HomeSectionProps) {
  const dashboard = useVolunteerDashboard(props);
  const { query: checks, pending } = usePendingChecks(props);
  const next = dashboard.data?.nextAssignment;
  // Each widget shows its own loading and error, so one slow read never hides the other.
  // Keyed by identity, not position: a slot leaving must not remount (and refetch) the others.
  const slots = [
    dashboard.isPending || dashboard.isError || next
      ? { key: 'next', Widget: NextAssignmentWidget }
      : null,
    checks.isPending || checks.isError || pending.length > 0
      ? { key: 'checks', Widget: PendingChecksWidget }
      : null,
    upcomingRows({ data: dashboard.data }).length > 0
      ? { key: 'upcoming', Widget: UpcomingAssignmentsWidget }
      : null,
  ].filter((slot) => slot !== null);
  const nothingWaits =
    dashboard.isSuccess && checks.isSuccess && !next && pending.length === 0;
  return (
    <div className="space-y-4">
      {nothingWaits ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <span className="flex items-center gap-2">
            <CircleCheck aria-hidden className="size-4 shrink-0" />
            {m.home_serving_all_clear()}
          </span>
          <Link
            to="/app/my-schedule"
            className="inline-flex min-h-11 items-center text-foreground underline underline-offset-4"
          >
            {m.nav_my_schedule()}
          </Link>
        </p>
      ) : null}
      <div className="grid gap-4 empty:hidden lg:grid-cols-12">
        {slots.map(({ key, Widget }, index) => (
          <div
            key={key}
            className={cn(
              'min-w-0',
              index === slots.length - 1 && index % 2 === 0
                ? 'lg:col-span-12'
                : PAIR_SPANS[index % 2],
            )}
          >
            <Widget {...props} />
          </div>
        ))}
      </div>
    </div>
  );
}

interface DateTileProps {
  day: CalendarDay;
  large?: boolean;
}

/** A calendar-leaf date: month and day stacked, so a list of dates scans at a glance. */
function DateTile({ day, large }: DateTileProps) {
  const month = formatMonthShort({ day, locale: getLocale() });
  return (
    <span
      aria-hidden
      className={cn(
        'radius-control flex shrink-0 flex-col items-center overflow-hidden border bg-card',
        large ? 'w-16' : 'w-12',
      )}
    >
      <span className="w-full bg-primary/10 py-0.5 text-center font-medium text-primary text-xs uppercase">
        {month}
      </span>
      <span
        className={cn(
          'font-semibold tabular-nums',
          large ? 'text-3xl leading-11' : 'text-lg leading-7',
        )}
      >
        {Number(day.slice(8))}
      </span>
    </span>
  );
}

export function UpcomingAssignmentsWidget(props: HomeSectionProps) {
  const { churchTimezone: timeZone } = useTimezone();
  const dashboard = useVolunteerDashboard(props);
  const rows = upcomingRows({ data: dashboard.data });
  return (
    <HomeWidget
      title={m.home_upcoming_assignments()}
      loading={dashboard.isPending}
      action={
        <Link
          to="/app/my-schedule"
          className="-my-3 inline-flex min-h-11 items-center underline"
        >
          {m.home_see_all()}
        </Link>
      }
    >
      {dashboard.isError ? (
        // The next-assignment and history widgets already offer the retry for this shared read.
        <p className="text-muted-foreground">{m.my_schedule_load_error()}</p>
      ) : (
        <ul className="grid gap-1">
          {rows.map(({ group, assignment }) => {
            const day = dayOf({ value: assignment.startTime, timeZone });
            return (
              <li key={assignment.assignmentId}>
                <Link
                  to="/app/my-schedule/$assignmentId"
                  params={{ assignmentId: assignment.assignmentId }}
                  className="radius-control -mx-2 flex min-h-11 items-center gap-4 px-2 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <DateTile day={day} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {group.eventTitle}
                    </span>
                    <span className="block text-muted-foreground text-sm">
                      {formatInstantRangeOf({
                        start: assignment.startTime,
                        end: assignment.endTime,
                        timeZone,
                      })}{' '}
                      · {assignment.sectorName} · {assignment.roleName}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </HomeWidget>
  );
}

const servingConfig = {
  served: { label: m.home_serving_series(), color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** The volunteer's own rhythm: assignments per month, and the ministries they serve in. */
export function ServingHistoryWidget(props: HomeSectionProps) {
  const dashboard = useVolunteerDashboard(props);
  const history = dashboard.data?.servingHistory ?? [];
  const ministries = dashboard.data?.ministryOptions ?? [];
  const total = history.reduce((sum, { served }) => sum + served, 0);
  const data = history.map(({ month, served }) => ({
    month: formatMonthShort({
      day: parseCalendarDay({ value: month }),
      locale: getLocale(),
    }),
    served,
  }));
  return (
    <HomeWidget
      title={m.home_serving_title()}
      loading={dashboard.isPending}
      error={
        dashboard.isError
          ? {
              message: m.my_schedule_load_error(),
              retry: () => dashboard.refetch(),
            }
          : undefined
      }
    >
      <div className="space-y-4">
        <p className="flex flex-col">
          <span className="text-muted-foreground text-sm">
            {m.home_serving_total()}
          </span>
          <span className="font-semibold text-3xl tabular-nums tracking-tight">
            {total}
          </span>
        </p>
        {total === 0 ? (
          <p className="text-muted-foreground text-sm">
            {m.home_serving_empty()}
          </p>
        ) : (
          <figure>
            <ChartContainer
              config={servingConfig}
              className="aspect-auto h-36 w-full"
            >
              <BarChart
                data={data}
                margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                accessibilityLayer
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <ChartTooltip
                  cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
                  content={<ChartTooltipContent hideIndicator />}
                />
                <Bar
                  dataKey="served"
                  fill="var(--color-served)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
            <figcaption className="sr-only">
              <ul>
                {data.map(({ month, served }) => (
                  <li key={month}>
                    {m.home_serving_month({ month, count: served })}
                  </li>
                ))}
              </ul>
            </figcaption>
          </figure>
        )}
        {ministries.length ? (
          <section className="space-y-2">
            <h3 className="font-medium text-muted-foreground text-sm">
              {m.home_serving_ministries()}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {ministries.map((ministry) => (
                <li key={ministry.id}>
                  <Badge variant="secondary">{ministry.name}</Badge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </HomeWidget>
  );
}
