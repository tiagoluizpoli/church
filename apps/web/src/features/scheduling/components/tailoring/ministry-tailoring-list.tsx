import { useMemo, useState } from 'react';
import type { SortDescriptor } from 'react-aria-components';
import type { MinistryTailoringSummaryRow } from '../participation-tailoring.utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useMediaQuery } from '@/hooks/use-media-query';

export interface MinistryTailoringListProps {
  rows: MinistryTailoringSummaryRow[];
  onSelectMinistry: (input: { ministryId: string }) => void;
}

const MINISTRY_TABLE_COLUMNS: DataTableColumn[] = [
  { id: 'name', name: 'Ministry', allowsSorting: true, isRowHeader: true },
  { id: 'events', name: 'Events', allowsSorting: true },
  { id: 'slots', name: 'Slots', allowsSorting: true },
  { id: 'actions', name: 'Actions' },
];

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
        className="workspace-panel-lg"
        data-testid="ministry-tailoring-list-panel"
      >
        <DataTable<MinistryTailoringSummaryRow>
          aria-label="Ministries"
          columns={MINISTRY_TABLE_COLUMNS}
          items={sortedRows}
          rowId={({ item }) => item.ministryId}
          rowTestId={({ item }) => `ministry-tailoring-row-${item.ministryId}`}
          sortDescriptor={sortDescriptor}
          onSortChange={setSortDescriptor}
          renderCell={({ item, column }) => (
            <>
              {column.id === 'name' ? item.ministryName : null}
              {column.id === 'events' ? item.eventCount : null}
              {column.id === 'slots' ? item.slotCount : null}
            </>
          )}
          rowActions={({ item }) => (
            <Button
              type="button"
              size={isMobile ? 'touch' : 'sm'}
              variant="outline"
              data-testid={`ministry-tailoring-button-${item.ministryId}`}
              onClick={() => onSelectMinistry({ ministryId: item.ministryId })}
            >
              View cycles
            </Button>
          )}
          renderMobileCard={({ item }) => (
            <div
              data-testid={`ministry-tailoring-card-${item.ministryId}`}
              className="surface-subtle workspace-panel space-y-3"
            >
              <div className="space-y-1">
                <div className="font-medium">{item.ministryName}</div>
                <div className="text-muted-foreground text-xs">
                  {item.eventCount} events · {item.slotCount} slots
                </div>
              </div>
            </div>
          )}
        />
      </div>
    </Card>
  );
}
