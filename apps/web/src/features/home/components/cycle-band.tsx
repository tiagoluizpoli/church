import { m } from '@church/i18n/messages';
import {
  type CalendarDay,
  calendarDaysBetween,
  now,
  parseCalendarDay,
  today,
} from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AnimatedNumber } from '@/features/home/components/animated-number';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { HomeWidget } from '@/features/home/components/home-widget';
import { useHomeSchedules } from '@/features/home/components/leadership-section';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import type { GetCycleAnchors200 } from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatCalendarDateOnly } from '@/shared/utils/church-time';
import { adminApi } from '@/utils/api-instances';

interface CycleBandProps extends HomeSectionProps {
  scope: string;
  /** Cycle anchors are a ChurchAdmin read; a leader sees the stages only. */
  showCycles: boolean;
}

const STAGES = [
  {
    stage: 'to_prepare',
    fill: 'bg-primary/25',
    label: () => m.schedules_to_prepare(),
  },
  {
    stage: 'asking',
    fill: 'bg-primary/50',
    label: () => m.schedules_asking_stage(),
  },
  {
    stage: 'assigning',
    fill: 'bg-primary/75',
    label: () => m.schedules_assigning(),
  },
  {
    stage: 'published',
    fill: 'bg-primary',
    label: () => m.schedules_published(),
  },
] as const;

type Anchor = NonNullable<GetCycleAnchors200['current']>;

interface CycleTimelineProps {
  current: Anchor | null;
  next: Anchor | null;
  churchDay: CalendarDay;
}

interface SpanInput {
  start: CalendarDay;
  end: CalendarDay;
}

/**
 * The current and next Cycle on one track that runs from the earlier of the
 * current Cycle's start and today to the last Cycle's end, with today marked.
 */
function CycleTimeline({ current, next, churchDay }: CycleTimelineProps) {
  const last = next ?? current;
  if (!last)
    return (
      <p className="flex flex-wrap items-center gap-x-3 text-muted-foreground">
        {m.home_next_cycle_none()}
        <Link
          to="/app/cycles"
          className="inline-flex min-h-11 items-center text-foreground underline underline-offset-4"
        >
          {m.home_next_cycle_plan()}
        </Link>
      </p>
    );
  const currentSpan = current
    ? {
        start: parseCalendarDay({ value: current.startDate }),
        end: parseCalendarDay({ value: current.endDate }),
      }
    : null;
  const start =
    currentSpan && currentSpan.start < churchDay
      ? currentSpan.start
      : churchDay;
  const end = parseCalendarDay({ value: last.endDate });
  const total = Math.max(1, calendarDaysBetween({ start, end }) + 1);
  const at = (day: CalendarDay) =>
    (Math.min(total, Math.max(0, calendarDaysBetween({ start, end: day }))) *
      100) /
    total;
  const place = ({ start: from, end: to }: SpanInput) => ({
    left: `${at(from)}%`,
    width: `${at(to) - at(from) + 100 / total}%`,
  });
  // The marker sits mid-day, so it lands inside today's slice of the track.
  const todayAt = at(churchDay) + 50 / total;
  const currentDays = currentSpan ? calendarDaysBetween(currentSpan) + 1 : 0;
  const day = currentSpan
    ? Math.min(
        currentDays,
        Math.max(
          1,
          calendarDaysBetween({ start: currentSpan.start, end: churchDay }) + 1,
        ),
      )
    : 0;
  return (
    <div className="space-y-2">
      <div aria-hidden className="relative pt-6">
        <span
          className={cn(
            'absolute top-0 text-xs',
            todayAt < 8
              ? 'left-0'
              : todayAt > 92
                ? 'right-0'
                : '-translate-x-1/2',
          )}
          style={
            todayAt >= 8 && todayAt <= 92 ? { left: `${todayAt}%` } : undefined
          }
        >
          {m.home_next_today()}
        </span>
        <div className="radius-control relative h-2.5 bg-muted">
          {currentSpan ? (
            <span
              className="radius-control absolute inset-y-0 overflow-hidden bg-primary/25"
              style={place(currentSpan)}
            >
              <span
                className="block h-full bg-primary/70"
                style={{ width: `${(day * 100) / currentDays}%` }}
              />
            </span>
          ) : null}
          {next ? (
            <span
              className="radius-control absolute inset-y-0 bg-primary/12 ring-1 ring-primary/35 ring-inset"
              style={place({
                start: parseCalendarDay({ value: next.startDate }),
                end: parseCalendarDay({ value: next.endDate }),
              })}
            />
          ) : null}
          <span
            className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 bg-foreground"
            style={{ left: `${todayAt}%` }}
          />
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
        {current ? (
          <CycleLabel
            cycle={current}
            prefix={m.home_current_cycle()}
            detail={m.home_cycle_progress({ day, total: currentDays })}
          />
        ) : null}
        {next ? (
          <CycleLabel
            cycle={next}
            prefix={m.home_next_cycle_title()}
            detail={
              next.state === 'draft'
                ? m.home_next_cycle_draft({ cycleName: next.name })
                : m.home_cycle_starts({
                    date: formatCalendarDateOnly({ value: next.startDate }),
                  })
            }
            alignEnd
          />
        ) : (
          <div className="@xl:ml-auto min-w-0 @xl:text-right text-sm">
            <p className="text-muted-foreground">
              {m.home_next_cycle_title()} · {m.home_next_cycle_none()}
            </p>
            <Link
              to="/app/cycles"
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              {m.home_next_cycle_plan()}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

interface CycleLabelProps {
  cycle: Anchor;
  prefix: string;
  detail: string;
  alignEnd?: boolean;
}

function CycleLabel({ cycle, prefix, detail, alignEnd }: CycleLabelProps) {
  return (
    <div className={cn('min-w-0', alignEnd && '@xl:ml-auto @xl:text-right')}>
      <p className="text-muted-foreground text-sm">
        {prefix}
        {' · '}
        <Link
          to="/app/cycles/$cycleId"
          params={{ cycleId: cycle.id }}
          className="inline-flex min-h-11 items-center font-semibold text-base text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {cycle.name}
        </Link>{' '}
        <span className="sr-only">
          {m.home_cycle_range({
            cycleName: cycle.name,
            start: formatCalendarDateOnly({ value: cycle.startDate }),
            end: formatCalendarDateOnly({ value: cycle.endDate }),
          })}
        </span>
      </p>
      <p className="text-muted-foreground text-sm tabular-nums">{detail}</p>
    </div>
  );
}

/**
 * The Cycle band: where the Church is in its Cycles, then current Schedules by
 * stage as one segmented pipeline. Each segment is labelled and links to its
 * filtered list; widths follow the counts, and an empty stage keeps a slot.
 */
export function CycleBand({ showCycles, ...props }: CycleBandProps) {
  const { churchTimezone } = useTimezone();
  const churchDay = today({ instant: now(), timeZone: churchTimezone });
  const schedules = useHomeSchedules(props);
  const anchors = useQuery({
    queryKey: homeSectionQueryKey({
      section: 'church',
      churchId: props.churchId,
      userId: props.userId,
      parts: ['cycle-anchors'],
    }),
    queryFn: () => adminApi.getCycleAnchors(),
    staleTime: 60_000,
    enabled: showCycles,
  });
  const counts = schedules.data?.counts;
  const total = counts
    ? STAGES.reduce((sum, { stage }) => sum + counts[stage], 0)
    : 0;
  return (
    <HomeWidget
      title={m.home_cycle_band()}
      action={
        counts ? (
          <span className="text-muted-foreground text-sm">
            {m.home_pipeline_total({ count: total })}
          </span>
        ) : undefined
      }
      loading={schedules.isPending || (showCycles && anchors.isPending)}
      error={
        schedules.isError
          ? { message: m.schedules_error(), retry: () => schedules.refetch() }
          : showCycles && anchors.isError
            ? {
                message: m.home_next_cycle_load_error(),
                retry: () => anchors.refetch(),
              }
            : undefined
      }
    >
      <div className="space-y-5">
        {showCycles && anchors.data ? (
          <CycleTimeline
            current={anchors.data.current}
            next={anchors.data.next}
            churchDay={churchDay}
          />
        ) : null}
        {counts ? (
          <ul className="flex flex-wrap gap-x-0.5 gap-y-3">
            {STAGES.map(({ stage, fill, label }) => (
              <li
                key={stage}
                className="min-w-32 basis-32 transition-[flex-grow] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                style={{ flexGrow: counts[stage] + 1 }}
              >
                <Link
                  to="/app/schedules"
                  search={{ stage }}
                  className="group flex min-h-11 flex-col gap-2 pb-1 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'block h-2.5',
                      counts[stage] > 0 ? fill : 'bg-muted',
                    )}
                  />
                  <span className="flex items-baseline gap-2 px-0.5">
                    <span className="text-sm group-hover:underline">
                      {label()}
                    </span>{' '}
                    <AnimatedNumber
                      value={counts[stage]}
                      className={cn(
                        'font-semibold text-lg',
                        counts[stage] === 0 && 'text-muted-foreground',
                      )}
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </HomeWidget>
  );
}
