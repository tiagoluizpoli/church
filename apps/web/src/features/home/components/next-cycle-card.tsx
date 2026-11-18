import { m } from '@church/i18n/messages';
import {
  calendarDaysBetween,
  now,
  parseCalendarDay,
  today,
} from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { HomeWidget } from '@/features/home/components/home-widget';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import type { GetCycleAnchors200Current } from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatCalendarDateOnly } from '@/shared/utils/church-time';
import { adminApi } from '@/utils/api-instances';

interface CycleTimelineProps {
  cycle: NonNullable<GetCycleAnchors200Current>;
}

/** The running Cycle as a track from its first to its last day, filled up to the Church's today. */
function CycleTimeline({ cycle }: CycleTimelineProps) {
  const { churchTimezone } = useTimezone();
  const churchDay = today({ instant: now(), timeZone: churchTimezone });
  const start = parseCalendarDay({ value: cycle.startDate });
  const end = parseCalendarDay({ value: cycle.endDate });
  const total = calendarDaysBetween({ start, end }) + 1;
  const day = Math.min(
    total,
    Math.max(1, calendarDaysBetween({ start, end: churchDay }) + 1),
  );
  const elapsed = (day * 100) / total;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Link
          to="/cycles/$cycleId"
          params={{ cycleId: cycle.id }}
          className="inline-flex min-h-11 items-center font-semibold text-xl hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {cycle.name}
        </Link>
        <span className="text-muted-foreground text-sm tabular-nums">
          {m.home_cycle_progress({ day, total })}
        </span>
      </div>
      <div aria-hidden className="radius-control relative h-2 bg-muted">
        <div
          className="radius-control h-full bg-primary/70"
          style={{ width: `${elapsed}%` }}
        />
        <div
          className="radius-pill absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 border-2 border-card bg-primary"
          style={{ left: `${elapsed}%` }}
        />
      </div>
      <div className="flex justify-between text-muted-foreground text-xs tabular-nums">
        <span>{formatCalendarDateOnly({ value: cycle.startDate })}</span>
        <span>{formatCalendarDateOnly({ value: cycle.endDate })}</span>
      </div>
    </div>
  );
}

interface NextCycleProps {
  cycle: GetCycleAnchors200Current;
}

function NextCycle({ cycle }: NextCycleProps) {
  if (!cycle)
    return (
      <div className="space-y-1">
        <p className="text-muted-foreground">{m.home_next_cycle_none()}</p>
        <Link
          to="/cycles"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          {m.home_next_cycle_plan()}
        </Link>
      </div>
    );
  return (
    <div className="space-y-1">
      <Link
        to="/cycles/$cycleId"
        params={{ cycleId: cycle.id }}
        className="inline-flex min-h-11 items-center font-semibold text-lg hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        {cycle.name}
      </Link>
      <p className="text-muted-foreground text-sm">
        {cycle.state === 'draft'
          ? m.home_next_cycle_draft({ cycleName: cycle.name })
          : m.home_cycle_starts({
              date: formatCalendarDateOnly({ value: cycle.startDate }),
            })}
      </p>
    </div>
  );
}

export function NextCycleCard({ churchId, userId }: HomeSectionProps) {
  const query = useQuery({
    queryKey: homeSectionQueryKey({
      section: 'church',
      churchId,
      userId,
      parts: ['cycle-anchors'],
    }),
    queryFn: () => adminApi.getCycleAnchors(),
    staleTime: 60_000,
  });
  const current = query.data?.current;
  return (
    <HomeWidget
      title={m.home_cycles()}
      loading={query.isPending}
      error={
        query.isError
          ? {
              message: m.home_next_cycle_load_error(),
              retry: () => query.refetch(),
            }
          : undefined
      }
    >
      <div className="space-y-4">
        <section className="space-y-1">
          <h3 className="font-medium text-muted-foreground text-sm">
            {m.home_current_cycle()}
          </h3>
          {current ? (
            <CycleTimeline cycle={current} />
          ) : (
            <p className="text-muted-foreground">{m.home_next_cycle_none()}</p>
          )}
        </section>
        <section className="space-y-1 border-t pt-4">
          <h3 className="font-medium text-muted-foreground text-sm">
            {m.home_next_cycle_title()}
          </h3>
          <NextCycle cycle={query.data?.next ?? null} />
        </section>
      </div>
    </HomeWidget>
  );
}
