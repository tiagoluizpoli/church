import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { formatMonthShort, parseCalendarDay } from '@church/time';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

type ChartTooltipLabelFormatter = NonNullable<
  React.ComponentProps<typeof ChartTooltipContent>['labelFormatter']
>;
type ChartTooltipFormatter = NonNullable<
  React.ComponentProps<typeof ChartTooltipContent>['formatter']
>;

import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { HomeWidget } from '@/features/home/components/home-widget';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import { cn } from '@/lib/utils';
import { adminApi } from '@/utils/api-instances';

interface InsightsProps extends HomeSectionProps {
  scope: string;
}

function useScheduleInsights({ churchId, userId, scope }: InsightsProps) {
  return useQuery({
    queryKey: homeSectionQueryKey({
      section: 'leadership',
      churchId,
      userId,
      parts: ['insights', scope],
    }),
    queryFn: () => adminApi.getScheduleInsights(),
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

interface FormatPercentInput {
  percent: number;
}

export function formatPercent({ percent }: FormatPercentInput): string {
  return new Intl.NumberFormat(getLocale(), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(percent / 100);
}

interface InsightsErrorInput {
  query: ReturnType<typeof useScheduleInsights>;
}

function insightsError({ query }: InsightsErrorInput) {
  return query.isError
    ? { message: m.home_insights_error(), retry: () => query.refetch() }
    : undefined;
}

function OpenSpots({ filled, needed }: Staffing) {
  const open = needed - filled;
  if (open <= 0) return null;
  return <span>{m.home_coverage_open({ count: open })}</span>;
}

interface MeterToneInput {
  percent: number;
}

/**
 * The Staffing Meter's traffic light (DESIGN.md), softened for the dashboard:
 * the same hues at reduced opacity, so status reads without shouting.
 */
function meterTone({ percent }: MeterToneInput) {
  if (percent >= 100)
    return { color: 'var(--color-green-600)', bar: 'bg-green-600/60' };
  if (percent >= 50)
    return { color: 'var(--color-yellow-500)', bar: 'bg-yellow-500/70' };
  return { color: 'var(--destructive)', bar: 'bg-destructive/60' };
}

const coverageRingConfig = {
  coverage: { label: m.home_trend_coverage() },
} satisfies ChartConfig;

interface CoverageRingProps extends Staffing {
  percent: number;
}

function CoverageRing({ filled, needed, percent }: CoverageRingProps) {
  return (
    <div className="relative mx-auto size-40 shrink-0">
      <ChartContainer
        config={coverageRingConfig}
        className="aspect-square size-full"
        aria-hidden
      >
        <RadialBarChart
          data={[{ coverage: Math.min(percent, 100) }]}
          startAngle={90}
          endAngle={-270}
          innerRadius="78%"
          outerRadius="100%"
          barSize={12}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey="coverage"
            fill={meterTone({ percent }).color}
            fillOpacity={percent >= 50 ? 0.7 : 0.6}
            background={{ fill: 'var(--muted)' }}
            cornerRadius={6}
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ChartContainer>
      <p className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-semibold text-3xl tabular-nums tracking-tight">
          {formatPercent({ percent })}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {filled}/{needed}
        </span>
      </p>
    </div>
  );
}

/** Coverage of the current Cycle: an overall ring, then each Ministry least covered first. */
export function CoverageWidget(props: InsightsProps) {
  const query = useScheduleInsights(props);
  const focus = query.data?.focus;
  const totals = query.data?.cycles.find(
    (cycle) => cycle.cycleId === focus?.cycleId,
  );
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
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <figure className="space-y-2">
            <CoverageRing {...totals} percent={coveragePercent(totals)} />
            <figcaption className="text-center text-muted-foreground text-sm">
              <span className="sr-only">{m.home_coverage_filled(totals)}</span>
              <OpenSpots {...totals} />
            </figcaption>
          </figure>
          {focus.ministries.length === 0 ? (
            <p className="text-muted-foreground">{m.home_coverage_empty()}</p>
          ) : (
            <ul className="min-w-0 flex-1">
              {focus.ministries.map((ministry) => {
                const percent = coveragePercent(ministry);
                return (
                  <li key={ministry.ministryId}>
                    <Link
                      to="/schedules/$ministryId/$cycleId"
                      params={{
                        ministryId: ministry.ministryId,
                        cycleId: focus.cycleId,
                      }}
                      aria-label={m.home_coverage_ministry({
                        ministryName: ministry.name,
                        filled: ministry.filled,
                        needed: ministry.needed,
                      })}
                      className="radius-control -mx-2 flex min-h-11 flex-col justify-center gap-1.5 px-2 py-1.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <span className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate">{ministry.name}</span>
                        <span className="flex shrink-0 gap-2 text-muted-foreground text-xs tabular-nums">
                          <OpenSpots {...ministry} />
                          <span>
                            {ministry.filled}/{ministry.needed}
                          </span>
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className="radius-control h-1.5 overflow-hidden bg-muted"
                      >
                        <span
                          className={cn(
                            'radius-control block h-full',
                            meterTone({ percent }).bar,
                          )}
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                      </span>
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

// One axis (percent of 0–100) for both series; the bar/line mark split carries identity alongside the legend.
const trendConfig = {
  filled: { label: m.home_trend_coverage(), color: 'var(--chart-1)' },
  responded: {
    label: m.home_trend_answered(),
    color: 'var(--muted-foreground)',
  },
} satisfies ChartConfig;

// named-parameters-ignore: Recharts calls the tooltip label formatter positionally
const trendCycleName: ChartTooltipLabelFormatter = (_, payload) =>
  payload[0]?.payload.name;

// named-parameters-ignore: Recharts calls the tooltip formatter positionally
const formatTrendValue: ChartTooltipFormatter = (value, name) => (
  <div className="flex w-full items-center justify-between gap-4">
    <span className="text-muted-foreground">
      {trendConfig[name as keyof typeof trendConfig].label}
    </span>
    <span className="font-medium font-mono tabular-nums">
      {formatPercent({ percent: Number(value) })}
    </span>
  </div>
);

/** Spots filled and availability answered across the latest Cycles, oldest first. */
export function TrendWidget(props: InsightsProps) {
  const query = useScheduleInsights(props);
  const cycles = query.data?.cycles ?? [];
  const data = cycles.map((cycle) => ({
    name: cycle.name,
    month: formatMonthShort({
      day: parseCalendarDay({ value: cycle.startDate }),
      locale: getLocale(),
    }),
    filled: cycle.needed > 0 ? coveragePercent(cycle) : null,
    responded:
      cycle.asked > 0 ? Math.floor((cycle.answered * 100) / cycle.asked) : null,
  }));
  return (
    <HomeWidget
      title={m.home_trend_title()}
      loading={query.isPending}
      error={insightsError({ query })}
    >
      {cycles.length === 0 ? (
        <p className="text-muted-foreground">{m.home_coverage_none()}</p>
      ) : (
        <figure>
          <ChartContainer
            config={trendConfig}
            className="aspect-auto h-56 w-full"
          >
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
              accessibilityLayer
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="capitalize"
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 50, 100]}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(percent: number) => formatPercent({ percent })}
              />
              <ChartTooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
                content={
                  <ChartTooltipContent
                    labelFormatter={trendCycleName}
                    formatter={formatTrendValue}
                  />
                }
              />
              <Bar
                dataKey="filled"
                fill="var(--color-filled)"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
              />
              <Line
                dataKey="responded"
                type="monotone"
                stroke="var(--color-responded)"
                strokeWidth={2}
                dot={{ r: 4, fill: 'var(--card)', strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
              <ChartLegend
                itemSorter="dataKey"
                content={<ChartLegendContent />}
              />
            </ComposedChart>
          </ChartContainer>
          <figcaption className="sr-only">
            <ul>
              {cycles.map((cycle) => (
                <li key={cycle.cycleId}>
                  {cycle.needed > 0
                    ? m.home_trend_cycle_coverage({
                        cycleName: cycle.name,
                        percent: formatPercent({
                          percent: coveragePercent(cycle),
                        }),
                        filled: cycle.filled,
                        needed: cycle.needed,
                      })
                    : `${cycle.name}: ${m.home_trend_no_spots()}`}
                  {cycle.asked > 0
                    ? `. ${m.home_trend_availability({
                        cycleName: cycle.name,
                        answered: cycle.answered,
                        asked: cycle.asked,
                      })}`
                    : null}
                </li>
              ))}
            </ul>
          </figcaption>
        </figure>
      )}
    </HomeWidget>
  );
}
