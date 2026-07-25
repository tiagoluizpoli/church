import type { ReactNode } from 'react';
import {
  type CycleStaffingSummary,
  staffingStatusClasses,
} from './cycle-builder-matrix.utils';
import { SyncedAgoLabel } from './synced-ago-label';
import { cn } from '@/lib/utils';
import { toCycleDayKey } from '@/shared/utils/date';

interface FormatCycleDateRangeInput {
  startDate?: string;
  endDate?: string;
}

/**
 * The cycle's own window, read as dates rather than instants — a cycle boundary
 * is a date in the church's timezone, never a time of day, so it is parsed at
 * local noon like every other day key on this board.
 */
export function formatCycleDateRange({
  startDate,
  endDate,
}: FormatCycleDateRangeInput): string | undefined {
  if (!(startDate && endDate)) return undefined;
  const start = new Date(`${toCycleDayKey(startDate)}T12:00:00`);
  const end = new Date(`${toCycleDayKey(endDate)}T12:00:00`);
  return `${start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} – ${end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

interface CycleBuilderHeaderProps {
  cycleName?: string;
  cycleStartDate?: string;
  cycleEndDate?: string;
  staffing: CycleStaffingSummary;
  /** Epoch ms of the last successful read of the builder query. */
  syncedAt?: number;
  isRefreshing?: boolean;
  /** Publish / audit controls, kept with the identity they act on. */
  actions: ReactNode;
}

/**
 * What used to sit here was a `text-primary text-xs` eyebrow, an `<h1>` reading
 * "Map the cycle, then place with confidence" and a supporting subhead — a
 * landing-page promise on the densest screen in the product, and the one screen
 * whose top line has real work to do (B-4).
 *
 * It carries the four facts a coordinator opening this at 9pm actually needs:
 * which cycle she is in, what window it covers, how much of it is done, and
 * whether the board she is reading is current.
 */
export function CycleBuilderHeader({
  cycleName,
  cycleStartDate,
  cycleEndDate,
  staffing,
  syncedAt,
  isRefreshing,
  actions,
}: CycleBuilderHeaderProps) {
  const dateRange = formatCycleDateRange({
    startDate: cycleStartDate,
    endDate: cycleEndDate,
  });
  const statusBarClass = staffingStatusClasses({
    percent: staffing.percent,
    hasRequirement: staffing.required > 0,
  }).bar;

  return (
    <header
      className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3"
      data-testid="cycle-builder-header"
    >
      <div className="min-w-0">
        <h1 className="truncate font-semibold text-xl tracking-tight">
          {cycleName ?? 'Cycle board'}
        </h1>
        {dateRange ? (
          <p className="text-muted-foreground text-sm">{dateRange}</p>
        ) : null}
      </div>
      {/* The only progress signal in a session that can run to forty
          assignments — and the only place a background refetch is
          attributable, which is why the synced line moved up here from the
          filter toolbar (B-1's line, B-4's home for it). */}
      <div
        className="min-w-56 flex-1 space-y-1"
        data-testid="cycle-builder-progress"
      >
        <p className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium">
            {staffing.required > 0
              ? `${staffing.filled} of ${staffing.required} assignments filled`
              : 'No staffing required yet'}
          </span>
          {/* The number stays on `--foreground`: `--destructive` measures
              4.45:1 against the app background at 14px, just under the AA
              floor axe enforces (`a11y-builder.spec.ts`). The bar below
              carries the status colour, where a 3:1 non-text ratio applies. */}
          {staffing.required > 0 ? (
            <span className="font-medium text-sm">{staffing.percent}%</span>
          ) : null}
        </p>
        <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
          <span
            className={cn('block h-full', statusBarClass)}
            style={{ width: `${Math.min(staffing.percent, 100)}%` }}
          />
        </span>
        <p className="flex items-baseline justify-between gap-3 text-muted-foreground text-xs">
          <span>
            {staffing.shiftsBelowTarget > 0
              ? `${staffing.shiftsBelowTarget} ${staffing.shiftsBelowTarget === 1 ? 'shift is' : 'shifts are'} below target`
              : 'Every included shift is at target'}
          </span>
          <SyncedAgoLabel syncedAt={syncedAt} isRefreshing={isRefreshing} />
        </p>
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </header>
  );
}
