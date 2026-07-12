import type { MinistryTailoringSummaryRow } from '../participation-tailoring.utils';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface MinistryTailoringListProps {
  rows: MinistryTailoringSummaryRow[];
  onSelectMinistry: (input: { ministryId: string }) => void;
}

const MINISTRY_TABLE_COLUMNS = [
  { id: 'name', name: 'Ministry' },
  { id: 'events', name: 'Events' },
  { id: 'slots', name: 'Slots' },
] as const;

/** Story 1 landing page: desktop table (`hidden md:block`) + mobile card list
 * (`md:hidden`), reusing `cycle-list-card.tsx`'s responsive structure. */
export function MinistryTailoringList({
  rows,
  onSelectMinistry,
}: MinistryTailoringListProps) {
  if (rows.length === 0) {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid="ministry-tailoring-empty-state"
      >
        No ministries yet. Join or create a ministry before tailoring
        participation.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden" role="listbox">
        {rows.map((row) => (
          <Button
            key={row.ministryId}
            type="button"
            variant="ghost"
            role="option"
            data-testid={`ministry-tailoring-card-${row.ministryId}`}
            className="surface-subtle workspace-panel h-auto w-full items-stretch justify-start whitespace-normal p-0 text-left font-normal"
            onClick={() => onSelectMinistry({ ministryId: row.ministryId })}
          >
            <div className="flex w-full items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="font-medium">{row.ministryName}</div>
                <div className="text-muted-foreground text-xs">
                  {row.eventCount} events · {row.slotCount} slots
                </div>
              </div>
            </div>
          </Button>
        ))}
      </div>

      <div className="hidden md:block">
        <Table aria-label="Ministries">
          <TableHeader columns={MINISTRY_TABLE_COLUMNS}>
            {(column) => (
              <TableColumn isRowHeader={column.id === 'name'}>
                {column.name}
              </TableColumn>
            )}
          </TableHeader>
          <TableBody items={rows}>
            {(row) => (
              <TableRow
                key={row.ministryId}
                id={row.ministryId}
                columns={MINISTRY_TABLE_COLUMNS}
                data-testid={`ministry-tailoring-row-${row.ministryId}`}
                onAction={() =>
                  onSelectMinistry({ ministryId: row.ministryId })
                }
              >
                {(column) => (
                  <TableCell>
                    {column.id === 'name' ? row.ministryName : null}
                    {column.id === 'events' ? row.eventCount : null}
                    {column.id === 'slots' ? row.slotCount : null}
                  </TableCell>
                )}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
