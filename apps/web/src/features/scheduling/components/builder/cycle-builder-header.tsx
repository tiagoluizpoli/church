import {
  type CycleCountsSummary,
  type CycleStaffingSummary,
  staffingStatusClasses,
} from '../../utils/builder/cycle-builder-staffing.utils';
import { SyncedAgoLabel } from './synced-ago-label';
import { WorkspaceIntroPanel } from '@/components/workspace-page';
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
  counts: CycleCountsSummary;
  /** Epoch ms of the last successful read of the builder query. */
  syncedAt?: number;
  isRefreshing?: boolean;
}

interface HeaderStatChipProps {
  testId: string;
  label: string;
  value: number;
}

/** Same standalone chip Planning's header uses — each stat is its own
 * bordered pill, not one box divided into columns (that's Tailoring's shape,
 * not this one). */
function HeaderStatChip({ testId, label, value }: HeaderStatChipProps) {
  return (
    <div className="radius-surface flex items-center gap-2 border border-border/70 bg-background/70 px-3 py-1.5 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium text-xs" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

/**
 * What used to sit here was a bespoke `<header>` — its own type scale, no
 * card, no page shell — while every other scheduling screen (Planning,
 * Tailoring) sits inside `WorkspaceIntroPanel`. That made the builder read as
 * a different product mid-workflow. This now renders through the same shell;
 * only the `aside` content (inventory counters, staffing progress, sync
 * status) stays builder-specific. Publish/audit controls live on the filter
 * toolbar below instead of here — stacking them under the progress bar left
 * this panel taller than the title/date column beside it for no reason.
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
  counts,
  syncedAt,
  isRefreshing,
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
    <div data-testid="cycle-builder-header">
      <WorkspaceIntroPanel
        title={cycleName ?? 'Cycle board'}
        description={dateRange ?? 'No dates set for this cycle yet.'}
        autoFocusTitle
        aside={
          <div className="flex w-full flex-col items-stretch gap-3 xl:w-auto xl:items-end">
            <div className="flex w-full flex-wrap gap-2 xl:w-auto xl:justify-end">
              <HeaderStatChip
                testId="cycle-builder-event-count"
                label="Events"
                value={counts.eventCount}
              />
              <HeaderStatChip
                testId="cycle-builder-slot-count"
                label="Slots"
                value={counts.slotCount}
              />
              <HeaderStatChip
                testId="cycle-builder-shift-count"
                label="Shifts"
                value={counts.shiftCount}
              />
              <HeaderStatChip
                testId="cycle-builder-assigned-count"
                label="Assigned"
                value={counts.assignedCount}
              />
            </div>
            {/* The only progress signal in a session that can run to forty
                assignments — and the only place a background refetch is
                attributable, which is why the synced line moved up here from
                the filter toolbar (B-1's line, B-4's home for it). */}
            <div
              className="w-full min-w-56 space-y-1 xl:w-80"
              data-testid="cycle-builder-progress"
            >
              <p className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">
                  {staffing.required > 0
                    ? `${staffing.filled} of ${staffing.required} assignments filled`
                    : 'No staffing required yet'}
                </span>
                {/* The number stays on `--foreground`: `--destructive`
                    measures 4.45:1 against the app background at 14px, just
                    under the AA floor axe enforces (`a11y-builder.spec.ts`).
                    The bar below carries the status colour, where a 3:1
                    non-text ratio applies. */}
                {staffing.required > 0 ? (
                  <span className="font-medium text-sm">
                    {staffing.percent}%
                  </span>
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
                <SyncedAgoLabel
                  syncedAt={syncedAt}
                  isRefreshing={isRefreshing}
                />
              </p>
            </div>
          </div>
        }
      />
    </div>
  );
}
