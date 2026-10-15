import { stateBadgeVariant } from './planning-admin.utils';
import {
  useCycleHeader,
  useCycleListStats,
  usePlanningTemplateLibraryStats,
} from './planning-admin-context';
import { Badge } from '@/components/ui/badge';
import { formatCalendarDateOnly } from '@/shared/utils/church-time';

interface CycleHeaderProps {
  showName?: boolean;
}

interface HeaderStatChipProps {
  testId: string;
  label: string;
  value: string;
}

function HeaderStatChip({ testId, label, value }: HeaderStatChipProps) {
  return (
    <div
      className="radius-surface flex items-center gap-2 border border-border/70 bg-background/70 px-3 py-1.5 text-sm"
      data-testid={testId}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium text-xs">{value}</span>
    </div>
  );
}

/**
 * The only place the selected cycle's status renders (FR-018, FR-019,
 * `data-model.md`'s `CycleHeaderModel`). It can render either the
 * full cycle name + status pairing or a compact status-only version when the
 * page title already carries the cycle name.
 */
export function CycleHeader({ showName = true }: CycleHeaderProps) {
  const { nameAndStatus, period, counts } = useCycleHeader();
  if (!nameAndStatus || !period || !counts) {
    return null;
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
      <div
        className="radius-surface flex min-w-0 items-center gap-2 border border-border/70 bg-background/70 px-3 py-1.5 text-sm"
        data-testid="cycle-name-status-chip"
      >
        {showName ? (
          <span
            className="truncate font-medium"
            data-testid="selected-cycle-name"
          >
            {nameAndStatus.name}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">Status</span>
        )}
        <Badge
          data-testid="selected-cycle-state"
          variant={stateBadgeVariant({ state: nameAndStatus.status })}
        >
          {nameAndStatus.status}
        </Badge>
      </div>
      <HeaderStatChip
        testId="cycle-period-chip"
        label="Window"
        value={`${formatCalendarDateOnly({ value: period.startDate })} → ${formatCalendarDateOnly({ value: period.endDate })}`}
      />
      <HeaderStatChip
        testId="cycle-event-count-chip"
        label="Events"
        value={String(counts.eventCount)}
      />
      <HeaderStatChip
        testId="cycle-slot-count-chip"
        label="Slots"
        value={String(counts.slotCount)}
      />
    </div>
  );
}

/**
 * The plain "Cycles" list view's own summary — rendered instead of
 * `CycleHeader` when no cycle is selected, since that header must
 * stay empty outside of a cycle review (see the leak-into-list-view fix).
 */
export function CycleListStats() {
  const { totalCount, draftCount, lockedCount } = useCycleListStats();

  return (
    <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
      <HeaderStatChip
        testId="cycles-total-chip"
        label="Cycles"
        value={String(totalCount)}
      />
      <HeaderStatChip
        testId="cycles-draft-chip"
        label="Draft"
        value={String(draftCount)}
      />
      <HeaderStatChip
        testId="cycles-sent-chip"
        label="Sent"
        value={String(lockedCount)}
      />
    </div>
  );
}

/**
 * The template library view's own summary — mirrors `CycleListStats`
 * but with a single chip, since a per-template block count isn't meaningful
 * at the library level.
 */
export function PlanningTemplateLibraryStats() {
  const { totalCount } = usePlanningTemplateLibraryStats();

  return (
    <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
      <HeaderStatChip
        testId="planning-templates-total-chip"
        label="Templates"
        value={String(totalCount)}
      />
    </div>
  );
}
