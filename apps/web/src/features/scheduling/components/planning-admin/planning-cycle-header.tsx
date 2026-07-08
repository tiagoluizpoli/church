import { formatCycleDate, stateBadgeVariant } from './planning-admin.utils';
import { usePlanningCycleHeader } from './planning-admin-context';
import { Badge } from '@/components/ui/badge';

interface PlanningCycleHeaderProps {
  showName?: boolean;
}

/**
 * The only place the selected cycle's status renders (FR-018, FR-019,
 * `data-model.md`'s `PlanningCycleHeaderModel`). It can render either the
 * full cycle name + status pairing or a compact status-only version when the
 * page title already carries the cycle name.
 */
export function PlanningCycleHeader({
  showName = true,
}: PlanningCycleHeaderProps) {
  const { nameAndStatus, period } = usePlanningCycleHeader();

  if (!nameAndStatus || !period) {
    return null;
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
      <div
        className="radius-surface flex min-w-0 items-center gap-2 border border-border/70 bg-background/70 px-3 py-1.5 text-sm"
        data-testid="planning-cycle-name-status-chip"
      >
        {showName ? (
          <span className="truncate font-medium">{nameAndStatus.name}</span>
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
      <div
        className="radius-surface flex items-center gap-2 border border-border/70 bg-background/70 px-3 py-1.5 text-sm"
        data-testid="planning-cycle-period-chip"
      >
        <span className="text-muted-foreground text-xs">Window</span>
        <span className="text-muted-foreground text-xs">
          {formatCycleDate({ date: period.startDate })} →{' '}
          {formatCycleDate({ date: period.endDate })}
        </span>
      </div>
    </div>
  );
}
