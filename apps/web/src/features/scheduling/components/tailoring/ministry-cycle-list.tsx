import { Link } from '@tanstack/react-router';
import { type ReactNode, useMemo, useState } from 'react';
import type { SortDescriptor } from 'react-aria-components';
import {
  cycleTailoringStatusBadgeVariant,
  cycleTailoringStatusLabel,
  type TailoringCycleSummary,
} from './cycle-list.utils';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  FormControlSizeProvider,
  useFormControlSize,
} from '@/components/ui/form-control-size';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMediaQuery } from '@/hooks/use-media-query';

export interface OnSelectCycleInput {
  cycleId: string;
}

export interface MinistryCycleListProps {
  ministryId: string;
  cycles: TailoringCycleSummary[];
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

const CYCLE_TABLE_COLUMNS = [
  { id: 'name', name: 'Name', allowsSorting: true },
  { id: 'window', name: 'Window', allowsSorting: true },
  { id: 'events', name: 'Events', allowsSorting: true },
  { id: 'slots', name: 'Slots', allowsSorting: true },
  { id: 'status', name: 'Status', allowsSorting: true },
  { id: 'actions', name: 'Actions', allowsSorting: false },
] as const;

const DEFAULT_SORT_DESCRIPTOR: SortDescriptor = {
  column: 'window',
  direction: 'ascending',
};

interface CompareCyclesInput {
  left: TailoringCycleSummary;
  right: TailoringCycleSummary;
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
    case 'slots':
      return (left.slotCount - right.slotCount) * direction;
    case 'status':
      return left.status.localeCompare(right.status) * direction;
    default:
      return left.startDate.localeCompare(right.startDate) * direction;
  }
}

/** Story 2 (amended, Iteration 3): cycle picker scoped to one ministry,
 * reusing `cycle-list-card.tsx`'s responsive `Card`/`surface-panel`
 * containment. Status is FR-030's leader-facing tailoring-progress status
 * (aggregated from `MinistryParticipation`, research.md R15/R16) — never
 * `PlanningCycle.state`. The parent route auto-advances past this component
 * entirely when exactly one cycle the ministry is part of is open
 * (research.md R7, recomputed in Iteration 3 against `isPartOf`) — it only
 * renders for the 0/2+ case. FR-036: `Card` padding uses the same
 * `workspace-panel-lg` token as the page header instead of shadcn's default
 * `px-4 py-4`. Rows are inert (no click-to-navigate) — the explicit
 * Tailoring/Assign buttons in the Actions column are the sole
 * navigation affordance, per design-critique follow-up: a redundant
 * row-click doing the same thing as the button added a spurious decision
 * point and gave screen readers a run-on accessible name per row. */
export function MinistryCycleList({
  ministryId,
  cycles,
  onSelectCycle,
  emptyMessage = 'No locked cycles are available for this ministry to tailor right now.',
  filters,
}: MinistryCycleListProps) {
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
        data-testid="ministry-cycle-list-empty-state"
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
            data-testid="ministry-cycle-list-filters-slot"
          >
            {filters}
          </div>
        ) : null}
        {cycles.length === 0 ? (
          <div className="workspace-panel-lg">
            <p
              className="text-muted-foreground text-sm"
              data-testid="ministry-cycle-list-empty-state"
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
          <div
            className="workspace-panel-lg space-y-3"
            data-testid="ministry-cycle-list-panel"
          >
            <div className="space-y-3 md:hidden">
              {sortedCycles.map((cycle) => (
                <div
                  key={cycle.id}
                  data-testid={`ministry-cycle-card-${cycle.id}`}
                  className="surface-subtle workspace-panel space-y-3"
                >
                  <div className="flex w-full items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium">{cycle.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {cycle.window}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {cycle.eventCount} events · {cycle.slotCount} slots
                      </div>
                    </div>
                    <Badge
                      variant={cycleTailoringStatusBadgeVariant({
                        status: cycle.status,
                      })}
                    >
                      {cycleTailoringStatusLabel({ status: cycle.status })}
                    </Badge>
                  </div>
                  <CycleRowActions
                    ministryId={ministryId}
                    cycle={cycle}
                    onSelectCycle={onSelectCycle}
                  />
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table
                aria-label="Cycles"
                sortDescriptor={sortDescriptor}
                onSortChange={setSortDescriptor}
              >
                <TableHeader columns={CYCLE_TABLE_COLUMNS}>
                  {(column) => (
                    <TableColumn
                      isRowHeader={column.id === 'name'}
                      allowsSorting={column.allowsSorting}
                    >
                      {column.name}
                    </TableColumn>
                  )}
                </TableHeader>
                <TableBody items={sortedCycles}>
                  {(cycle) => (
                    <TableRow
                      key={cycle.id}
                      id={cycle.id}
                      columns={CYCLE_TABLE_COLUMNS}
                      data-testid={`ministry-cycle-row-${cycle.id}`}
                    >
                      {(column) => (
                        <TableCell>
                          {column.id === 'name' ? cycle.name : null}
                          {column.id === 'window' ? cycle.window : null}
                          {column.id === 'events' ? cycle.eventCount : null}
                          {column.id === 'slots' ? cycle.slotCount : null}
                          {column.id === 'status' ? (
                            <Badge
                              variant={cycleTailoringStatusBadgeVariant({
                                status: cycle.status,
                              })}
                            >
                              {cycleTailoringStatusLabel({
                                status: cycle.status,
                              })}
                            </Badge>
                          ) : null}
                          {column.id === 'actions' ? (
                            <CycleRowActions
                              ministryId={ministryId}
                              cycle={cycle}
                              onSelectCycle={onSelectCycle}
                            />
                          ) : null}
                        </TableCell>
                      )}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Card>
    </FormControlSizeProvider>
  );
}

interface CycleRowActionsProps {
  ministryId: string;
  cycle: TailoringCycleSummary;
  onSelectCycle: (input: OnSelectCycleInput) => void;
}

/** FR-035: Roster is always enabled and formalizes what row-click already
 * does; Assign links to the cycle-centric builder and stays enabled once
 * any availability has fired for this cycle. */
function CycleRowActions({
  ministryId,
  cycle,
  onSelectCycle,
}: CycleRowActionsProps) {
  const isMobile = useFormControlSize() === 'touch';
  const size = isMobile ? 'touch' : 'sm';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size={size}
        variant="outline"
        data-testid={`ministry-cycle-tailoring-button-${cycle.id}`}
        onClick={() => onSelectCycle({ cycleId: cycle.id })}
      >
        Roster
      </Button>
      {cycle.availabilityFiredForAny ? (
        <Link
          to="/scheduling/rostering/$ministryId/$cycleId"
          params={{ ministryId, cycleId: cycle.id }}
          data-testid={`ministry-cycle-assign-link-${cycle.id}`}
          className={buttonVariants({ variant: 'outline', size })}
        >
          Assign
        </Link>
      ) : (
        <Button
          type="button"
          size={size}
          variant="outline"
          disabled
          title="Unlocks once availability has fired for this cycle"
          aria-label="Unlocks once availability has fired for this cycle"
          data-testid={`ministry-cycle-assign-button-${cycle.id}`}
        >
          Assign
        </Button>
      )}
    </div>
  );
}
