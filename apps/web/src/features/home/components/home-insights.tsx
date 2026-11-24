import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { MouseEvent } from 'react';
import { AnimatedNumber } from '@/features/home/components/animated-number';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { HomeWidget } from '@/features/home/components/home-widget';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import { cn } from '@/lib/utils';
import { SCHEDULE_TITLE_TRANSITION } from '@/shared/utils/view-transition-names';
import { adminApi } from '@/utils/api-instances';

interface InsightsProps extends HomeSectionProps {
  scope: string;
  enabled?: boolean;
}

export function useScheduleInsights({
  churchId,
  userId,
  scope,
  enabled = true,
}: InsightsProps) {
  return useQuery({
    queryKey: homeSectionQueryKey({
      section: 'leadership',
      churchId,
      userId,
      parts: ['insights', scope],
    }),
    queryFn: () => adminApi.getScheduleInsights(),
    enabled,
  });
}

interface Staffing {
  filled: number;
  needed: number;
}

/** Whole percent, floored so a schedule one spot short never reads 100%. */
export function coveragePercent({ filled, needed }: Staffing): number {
  return needed > 0 ? Math.floor((filled * 100) / needed) : 0;
}

interface Availability {
  answered: number;
  asked: number;
}

function responsePercent({ answered, asked }: Availability): number {
  return asked > 0 ? Math.floor((answered * 100) / asked) : 0;
}

interface FormatPercentInput {
  percent: number;
}

export function formatPercent({ percent }: FormatPercentInput): string {
  return new Intl.NumberFormat(getLocale(), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(percent / 100);
}

const percentText = (percent: number) => formatPercent({ percent });

interface InsightsErrorInput {
  query: ReturnType<typeof useScheduleInsights>;
}

function insightsError({ query }: InsightsErrorInput) {
  return query.isError
    ? { message: m.home_insights_error(), retry: () => query.refetch() }
    : undefined;
}

interface MeterToneInput {
  percent: number;
}

/**
 * The Staffing Meter's traffic light (DESIGN.md), softened for the dashboard:
 * the same `--meter-*` hues at reduced opacity, so status reads without shouting.
 */
function meterTone({ percent }: MeterToneInput) {
  if (percent >= 100) return 'bg-meter-success/60';
  if (percent >= 50) return 'bg-meter-warning/70';
  return 'bg-meter-danger/60';
}

interface MeterProps {
  percent: number;
  /** Fill class; the track stays visible at 0 so an empty meter still reads as one. */
  fill: string;
  thin?: boolean;
}

/** A thin bar that grows from its old width to the new one when the value changes after first paint. */
export function Meter({ percent, fill, thin }: MeterProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'radius-control block overflow-hidden bg-muted',
        thin ? 'h-1' : 'h-1.5',
      )}
    >
      <span
        className={cn(
          'radius-control block h-full transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
          fill,
        )}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </span>
  );
}

/**
 * Names only the clicked row's title for the schedule header morph, so the
 * page never holds two elements with the same view-transition name.
 */
function nameMorphSource(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
    return;
  for (const title of document.querySelectorAll<HTMLElement>(
    '[data-morph-title]',
  ))
    title.style.viewTransitionName = '';
  const title =
    event.currentTarget.querySelector<HTMLElement>('[data-morph-title]');
  if (title) title.style.viewTransitionName = SCHEDULE_TITLE_TRANSITION;
}

/** Coverage of the focus Cycle: one inline figure, its availability answers, then each Ministry least covered first. */
export function CoverageWidget(props: InsightsProps) {
  const query = useScheduleInsights(props);
  const focus = query.data?.focus;
  const totals = query.data?.cycles.find(
    (cycle) => cycle.cycleId === focus?.cycleId,
  );
  const percent = totals ? coveragePercent(totals) : 0;
  return (
    <HomeWidget
      title={
        focus
          ? m.home_coverage_title({ cycleName: focus.name })
          : m.home_trend_coverage()
      }
      loading={query.isPending}
      error={insightsError({ query })}
    >
      {!focus || !totals ? (
        <p className="text-muted-foreground">{m.home_coverage_none()}</p>
      ) : (
        <div className="space-y-5">
          <div className="grid @xl:grid-cols-2 @xl:gap-8 gap-4">
            <div className="space-y-2">
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <AnimatedNumber
                  value={percent}
                  format={percentText}
                  className="font-semibold text-3xl tracking-tight"
                />
                <span className="text-muted-foreground text-sm tabular-nums">
                  {m.home_coverage_filled(totals)}
                  {totals.needed > totals.filled
                    ? ` · ${m.home_coverage_open({ count: totals.needed - totals.filled })}`
                    : null}
                </span>
              </p>
              <Meter percent={percent} fill={meterTone({ percent })} />
            </div>
            {totals.asked > 0 ? (
              <div className="space-y-2 @xl:self-end">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span>{m.home_trend_answered()}</span>
                  <span className="text-muted-foreground tabular-nums">
                    <AnimatedNumber
                      value={responsePercent(totals)}
                      format={percentText}
                      className="font-semibold text-foreground"
                    />{' '}
                    · {totals.answered}/{totals.asked}
                  </span>
                </p>
                <Meter
                  percent={responsePercent(totals)}
                  fill="bg-primary/50"
                  thin
                />
              </div>
            ) : null}
          </div>
          {focus.ministries.length === 0 ? (
            <p className="text-muted-foreground">{m.home_coverage_empty()}</p>
          ) : (
            <ul className="grid @2xl:grid-cols-2 gap-x-8 border-t pt-3">
              {focus.ministries.map((ministry) => {
                const ministryPercent = coveragePercent(ministry);
                const open = ministry.needed - ministry.filled;
                return (
                  <li key={ministry.ministryId}>
                    <Link
                      to="/app/schedules/$ministryId/$cycleId"
                      params={{
                        ministryId: ministry.ministryId,
                        cycleId: focus.cycleId,
                      }}
                      viewTransition
                      onClick={nameMorphSource}
                      aria-label={m.home_coverage_ministry({
                        ministryName: ministry.name,
                        filled: ministry.filled,
                        needed: ministry.needed,
                      })}
                      className="radius-control -mx-2 flex min-h-11 flex-col justify-center gap-1.5 px-2 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <span className="flex items-baseline justify-between gap-3 text-sm">
                        <span data-morph-title className="truncate">
                          {ministry.name}
                        </span>
                        <span className="flex shrink-0 items-baseline gap-2 text-muted-foreground text-xs tabular-nums">
                          {open > 0 ? (
                            <span>{m.home_coverage_open({ count: open })}</span>
                          ) : null}
                          <span>
                            {ministry.filled}/{ministry.needed}
                          </span>
                          <AnimatedNumber
                            value={ministryPercent}
                            format={percentText}
                            className="min-w-9 text-right font-semibold text-foreground"
                          />
                        </span>
                      </span>
                      <Meter
                        percent={ministryPercent}
                        fill={meterTone({ percent: ministryPercent })}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </HomeWidget>
  );
}

interface TrendMeterProps {
  label: string;
  /** Null when the Cycle had nothing to measure. */
  percent: number | null;
  detail: string;
  fill: string;
  thin?: boolean;
}

function TrendMeter({ label, percent, detail, fill, thin }: TrendMeterProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-right text-xs tabular-nums">
        {percent === null ? (
          <span className="text-muted-foreground">{detail}</span>
        ) : (
          <>
            <AnimatedNumber
              value={percent}
              format={percentText}
              className="font-semibold"
            />{' '}
            <span className="text-muted-foreground">{detail}</span>
          </>
        )}
      </dd>
      <dd className="col-span-2">
        <Meter percent={percent ?? 0} fill={fill} thin={thin} />
      </dd>
    </div>
  );
}

/** The latest Cycles as small multiples, oldest first: spots filled and availability answered, each labelled. */
export function TrendWidget(props: InsightsProps) {
  const query = useScheduleInsights(props);
  const cycles = query.data?.cycles ?? [];
  return (
    <HomeWidget
      title={m.home_trend_title()}
      loading={query.isPending}
      error={insightsError({ query })}
    >
      {cycles.length === 0 ? (
        <p className="text-muted-foreground">{m.home_coverage_none()}</p>
      ) : (
        <ul className="grid @3xl:grid-cols-1 @md:grid-cols-2 gap-x-6 gap-y-4">
          {cycles.map((cycle) => {
            const filled = cycle.needed > 0 ? coveragePercent(cycle) : null;
            return (
              <li key={cycle.cycleId} className="space-y-2">
                <h3 className="font-medium text-sm">{cycle.name}</h3>
                <dl className="space-y-2">
                  <TrendMeter
                    label={m.home_trend_coverage()}
                    percent={filled}
                    detail={
                      filled === null
                        ? m.home_trend_no_spots()
                        : `${cycle.filled}/${cycle.needed}`
                    }
                    fill={meterTone({ percent: filled ?? 0 })}
                  />
                  <TrendMeter
                    label={m.home_trend_answered()}
                    percent={cycle.asked > 0 ? responsePercent(cycle) : null}
                    detail={
                      cycle.asked > 0
                        ? `${cycle.answered}/${cycle.asked}`
                        : m.home_trend_no_asks()
                    }
                    fill="bg-primary/50"
                    thin
                  />
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </HomeWidget>
  );
}
