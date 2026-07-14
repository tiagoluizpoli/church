import { useMemo, useState } from 'react';
import type { SortDescriptor } from 'react-aria-components';
import type { MinistryTailoringSummaryRow } from '../participation-tailoring.utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMediaQuery } from '@/hooks/use-media-query';

export interface MinistryTailoringListProps {
  rows: MinistryTailoringSummaryRow[];
  onSelectMinistry: (input: { ministryId: string }) => void;
}

const MINISTRY_TABLE_COLUMNS = [
  { id: 'name', name: 'Ministry', allowsSorting: true },
  { id: 'events', name: 'Events', allowsSorting: true },
  { id: 'slots', name: 'Slots', allowsSorting: true },
  { id: 'actions', name: 'Actions', allowsSorting: false },
] as const;

const DEFAULT_SORT_DESCRIPTOR: SortDescriptor = {
  column: 'name',
  direction: 'ascending',
};

function compareRows({
  left,
  right,
  sortDescriptor,
}: {
  left: MinistryTailoringSummaryRow;
  right: MinistryTailoringSummaryRow;
  sortDescriptor: SortDescriptor;
}): number {
  const direction = sortDescriptor.direction === 'descending' ? -1 : 1;

  switch (sortDescriptor.column) {
    case 'events':
      return (left.eventCount - right.eventCount) * direction;
    case 'slots':
      return (left.slotCount - right.slotCount) * direction;
    default:
      return left.ministryName.localeCompare(right.ministryName) * direction;
  }
}

/** Story 1 landing page: desktop table (`hidden md:block`) + mobile card list
 * (`md:hidden`), matching `ministry-cycle-list.tsx`'s card/panel/sort
 * conventions for a consistent look across both tailoring list screens. No
 * filter toolbar — this list is small and unfiltered by design. Rows are
 * inert (no click-to-navigate); the explicit "View cycles" button in the
 * Actions column is the sole navigation affordance, mirroring the cycle
 * list's row-click removal (a redundant decision point + a run-on a11y
 * name per row). */
export function MinistryTailoringList({
  rows,
  onSelectMinistry,
}: MinistryTailoringListProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>(
    DEFAULT_SORT_DESCRIPTOR,
  );
  const sortedRows = useMemo(
    () =>
      [...rows].sort((left, right) =>
        compareRows({ left, right, sortDescriptor }),
      ),
    [rows, sortDescriptor],
  );

  if (rows.length === 0) {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid="ministry-tailoring-empty-state"
      >
        No ministries yet. Join or create a ministry before rostering.
      </p>
    );
  }

  return (
    <Card className="surface-panel py-0">
      <div
        className="workspace-panel-lg space-y-3"
        data-testid="ministry-tailoring-list-panel"
      >
        <div className="space-y-3 md:hidden" role="listbox">
          {sortedRows.map((row) => (
            <div
              key={row.ministryId}
              data-testid={`ministry-tailoring-card-${row.ministryId}`}
              className="surface-subtle workspace-panel space-y-3"
            >
              <div className="space-y-1">
                <div className="font-medium">{row.ministryName}</div>
                <div className="text-muted-foreground text-xs">
                  {row.eventCount} events · {row.slotCount} slots
                </div>
              </div>
              <Button
                type="button"
                size="touch"
                variant="outline"
                data-testid={`ministry-tailoring-button-${row.ministryId}`}
                onClick={() => onSelectMinistry({ ministryId: row.ministryId })}
              >
                View cycles
              </Button>
            </div>
          ))}
        </div>

        <div className="hidden md:block">
          <Table
            aria-label="Ministries"
            sortDescriptor={sortDescriptor}
            onSortChange={setSortDescriptor}
          >
            <TableHeader columns={MINISTRY_TABLE_COLUMNS}>
              {(column) => (
                <TableColumn
                  isRowHeader={column.id === 'name'}
                  allowsSorting={column.allowsSorting}
                >
                  {column.name}
                </TableColumn>
              )}
            </TableHeader>
            <TableBody items={sortedRows}>
              {(row) => (
                <TableRow
                  key={row.ministryId}
                  id={row.ministryId}
                  columns={MINISTRY_TABLE_COLUMNS}
                  data-testid={`ministry-tailoring-row-${row.ministryId}`}
                >
                  {(column) => (
                    <TableCell>
                      {column.id === 'name' ? row.ministryName : null}
                      {column.id === 'events' ? row.eventCount : null}
                      {column.id === 'slots' ? row.slotCount : null}
                      {column.id === 'actions' ? (
                        <Button
                          type="button"
                          size={isMobile ? 'touch' : 'sm'}
                          variant="outline"
                          data-testid={`ministry-tailoring-button-${row.ministryId}`}
                          onClick={() =>
                            onSelectMinistry({ ministryId: row.ministryId })
                          }
                        >
                          View cycles
                        </Button>
                      ) : null}
                    </TableCell>
                  )}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Card>
  );
}
