import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useMemo, useState } from 'react';
import type { SortDescriptor } from 'react-aria-components';
import {
  cyclePrepareStatusBadgeVariant,
  cyclePrepareStatusLabel,
  type PrepareCycleSummary,
  prepareCountsSummary,
} from './cycle-list.utils';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  FormControlSizeProvider,
  useFormControlSize,
} from '@/components/ui/form-control-size';
import { useMediaQuery } from '@/hooks/use-media-query';

export interface OnSelectCycleInput {
  cycleId: string;
}

export interface ScheduleListProps {
  ministryId: string;
  cycles: PrepareCycleSummary[];
  onSelectCycle: (input: OnSelectCycleInput) => void;
  emptyMessage?: ReactNode;
  /** Rendered as a toolbar strip inside this component's own card, above
   * the table/mobile list — design-critique follow-up: filters previously
   * floated as a separate block above the table; they now live on top of
   * the same rounded surface as the data they filter, matching the toolbar
   * pattern this repo already uses elsewhere. Stays visible even when
   * `cycles` is empty, so a leader can always adjust or clear filters
   * rather than losing the controls the moment a filter combination
   * matches nothing. */
  filters?: ReactNode;
}

const cycleTableColumns = (): DataTableColumn[] => [
  {
    id: 'name',
    name: m.cycles_column_name(),
    allowsSorting: true,
    isRowHeader: true,
  },
  { id: 'window', name: m.cycles_column_window(), allowsSorting: true },
  { id: 'events', name: m.cycle_header_events(), allowsSorting: true },
  {
    id: 'eventTimeBlocks',
    name: m.cycle_review_column_time_blocks(),
    allowsSorting: true,
  },
  { id: 'status', name: m.cycles_column_status(), allowsSorting: true },
  {
    id: 'actions',
    name: m.cycle_review_column_actions(),
    allowsSorting: false,
  },
];

const DEFAULT_SORT_DESCRIPTOR: SortDescriptor = {
  column: 'window',
  direction: 'ascending',
};

interface CompareCyclesInput {
  left: PrepareCycleSummary;
  right: PrepareCycleSummary;
  sortDescriptor: SortDescriptor;
}

function compareCycles({
  left,
  right,
  sortDescriptor,
}: CompareCyclesInput): number {
  const direction = sortDescriptor.direction === 'descending' ? -1 : 1;

  switch (sortDescriptor.column) {
    case 'name':
      return left.name.localeCompare(right.name) * direction;
    case 'events':
      return (left.eventCount - right.eventCount) * direction;
    case 'eventTimeBlocks':
      return (left.eventTimeBlockCount - right.eventTimeBlockCount) * direction;
    case 'status':
      return left.status.localeCompare(right.status) * direction;
    default:
      return left.startDate.localeCompare(right.startDate) * direction;
  }
}

/** Story 2 (amended, Iteration 3): cycle picker scoped to one ministry,
 * reusing `cycle-list-card.tsx`'s responsive `Card`/`surface-panel`
 * containment. Status is FR-030's leader-facing prepare-progress status
 * (aggregated from `MinistryParticipation`, research.md R15/R16) — never
 * `Cycle.state`. The parent route auto-advances past this component
 * entirely when exactly one cycle the ministry is part of is open
 * (research.md R7, recomputed in Iteration 3 against `isPartOf`) — it only
 * renders for the 0/2+ case. FR-036: `Card` padding uses the same
 * `workspace-panel-lg` token as the page header instead of shadcn's default
 * `px-4 py-4`. Rows are inert (no click-to-navigate) — the explicit
 * Prepare/Assign buttons in the Actions column are the sole
 * navigation affordance, per design-critique follow-up: a redundant
 * row-click doing the same thing as the button added a spurious decision
 * point and gave screen readers a run-on accessible name per row. */
export function ScheduleList({
  ministryId,
  cycles,
  onSelectCycle,
  emptyMessage = m.prepare_cycle_list_empty(),
  filters,
}: ScheduleListProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>(
    DEFAULT_SORT_DESCRIPTOR,
  );
  const sortedCycles = useMemo(
    () =>
      [...cycles].sort((left, right) =>
        compareCycles({ left, right, sortDescriptor }),
      ),
    [cycles, sortDescriptor],
  );

  if (cycles.length === 0 && !filters) {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid="schedule-list-empty-state"
      >
        {emptyMessage}
      </p>
    );
  }

  return (
    <FormControlSizeProvider size={isMobile ? 'touch' : 'default'}>
      <Card className="surface-panel py-0">
        {filters ? (
          // Same `workspace-panel-lg` token as the content below, so the
          // toolbar and the table read as one continuous rounded surface
          // instead of a floating block sitting above it.
          <div
            className="workspace-panel-lg border-border/70 border-b"
            data-testid="schedule-list-filters"
          >
            {filters}
          </div>
        ) : null}
        {cycles.length === 0 ? (
          <div className="workspace-panel-lg">
            <p
              className="text-muted-foreground text-sm"
              data-testid="schedule-list-empty-state"
            >
              {emptyMessage}
            </p>
          </div>
        ) : (
          /* Plain div, not `CardContent` — `CardContent`'s own `px-4` utility
           * lives in Tailwind's `@layer utilities`, which always wins the
           * cascade over `.workspace-panel-lg`'s `@layer components` padding
           * shorthand regardless of source order, silently zeroing the
           * horizontal padding this token is supposed to provide. Matches how
           * `WorkspaceIntroPanel` avoids the same trap. */
          <div className="workspace-panel-lg" data-testid="schedule-list-panel">
            <DataTable<PrepareCycleSummary>
              aria-label={m.nav_cycles()}
              columns={cycleTableColumns()}
              items={sortedCycles}
              rowId={({ item }) => item.id}
              rowTestId={({ item }) => `schedule-row-${item.id}`}
              sortDescriptor={sortDescriptor}
              onSortChange={setSortDescriptor}
              renderCell={({ item, column }) => (
                <>
                  {column.id === 'name' ? item.name : null}
                  {column.id === 'window' ? item.window : null}
                  {column.id === 'events' ? item.eventCount : null}
                  {column.id === 'eventTimeBlocks'
                    ? item.eventTimeBlockCount
                    : null}
                  {column.id === 'status' ? (
                    <Badge
                      variant={cyclePrepareStatusBadgeVariant({
                        status: item.status,
                      })}
                    >
                      {cyclePrepareStatusLabel({ status: item.status })}
                    </Badge>
                  ) : null}
                  {column.id === 'actions' ? (
                    <CycleRowActions
                      ministryId={ministryId}
                      cycle={item}
                      onSelectCycle={onSelectCycle}
                      layout="table"
                    />
                  ) : null}
                </>
              )}
              renderMobileCard={({ item }) => (
                <div
                  data-testid={`schedule-card-${item.id}`}
                  className="surface-subtle workspace-panel space-y-3"
                >
                  <div className="flex w-full items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {item.window}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {prepareCountsSummary({
                          eventCount: item.eventCount,
                          eventTimeBlockCount: item.eventTimeBlockCount,
                        })}
                      </div>
                    </div>
                    <Badge
                      variant={cyclePrepareStatusBadgeVariant({
                        status: item.status,
                      })}
                    >
                      {cyclePrepareStatusLabel({ status: item.status })}
                    </Badge>
                  </div>
                  <CycleRowActions
                    ministryId={ministryId}
                    cycle={item}
                    onSelectCycle={onSelectCycle}
                    layout="card"
                  />
                </div>
              )}
            />
          </div>
        )}
      </Card>
    </FormControlSizeProvider>
  );
}

interface CycleRowActionsProps {
  ministryId: string;
  cycle: PrepareCycleSummary;
  onSelectCycle: (input: OnSelectCycleInput) => void;
  layout: 'table' | 'card';
}

/** FR-035: Schedule is always enabled and formalizes what row-click already
 * does; Assign links to the cycle-centric builder and stays enabled once
 * any availability is requested for this cycle. */
function CycleRowActions({
  ministryId,
  cycle,
  onSelectCycle,
  layout,
}: CycleRowActionsProps) {
  const isMobile = useFormControlSize() === 'touch';
  const size = isMobile ? 'touch' : 'sm';
  // Table and card copies are both in the DOM, so each needs its own id.
  const reasonId = `schedule-assign-reason-${cycle.id}-${layout}`;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          size={size}
          variant="outline"
          data-testid={`schedule-prepare-button-${cycle.id}`}
          onClick={() => onSelectCycle({ cycleId: cycle.id })}
        >
          {m.prepare_cycle_action_schedule()}
        </Button>
        {cycle.availabilityRequestedForAny ? (
          <Link
            to="/schedules/$ministryId/$cycleId/assign"
            params={{ ministryId, cycleId: cycle.id }}
            data-testid={`schedule-assign-link-${cycle.id}`}
            className={buttonVariants({ variant: 'outline', size })}
          >
            {m.prepare_cycle_action_assign()}
          </Link>
        ) : (
          <Button
            type="button"
            size={size}
            variant="outline"
            disabled
            aria-describedby={reasonId}
            data-testid={`schedule-assign-button-${cycle.id}`}
          >
            {m.prepare_cycle_action_assign()}
          </Button>
        )}
      </div>
      {cycle.availabilityRequestedForAny ? null : (
        // Visible on touch; desktop keeps it as the accessible description.
        <p
          id={reasonId}
          data-testid={`schedule-assign-reason-${cycle.id}`}
          className="text-right text-muted-foreground text-xs md:sr-only"
        >
          {m.prepare_cycle_assign_locked()}
        </p>
      )}
    </div>
  );
}
