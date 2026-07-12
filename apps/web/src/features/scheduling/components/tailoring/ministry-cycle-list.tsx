import type { TailoringCycleOption } from '../participation-tailoring.utils';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface MinistryCycleListProps {
  cycles: TailoringCycleOption[];
  onSelectCycle: (input: { cycleId: string }) => void;
}

const CYCLE_TABLE_COLUMNS = [
  { id: 'cycle', name: 'Cycle' },
  { id: 'events', name: 'Events' },
] as const;

/** Story 2: cycle picker scoped to one ministry, reusing `cycle-list-card.tsx`'s
 * responsive list pattern (desktop table + mobile card list). The parent
 * route auto-advances past this component entirely when exactly one cycle
 * is open (research.md R7) — it only renders for the 0/2+ cases. */
export function MinistryCycleList({
  cycles,
  onSelectCycle,
}: MinistryCycleListProps) {
  if (cycles.length === 0) {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid="ministry-cycle-list-empty-state"
      >
        No cycles are open for this ministry to tailor right now.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden" role="listbox">
        {cycles.map((cycle) => (
          <Button
            key={cycle.id}
            type="button"
            variant="ghost"
            role="option"
            data-testid={`ministry-cycle-card-${cycle.id}`}
            className="surface-subtle workspace-panel h-auto w-full items-stretch justify-start whitespace-normal p-0 text-left font-normal"
            onClick={() => onSelectCycle({ cycleId: cycle.id })}
          >
            <div className="flex w-full items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="font-medium">{cycle.label}</div>
                <div className="text-muted-foreground text-xs">
                  {cycle.eventCount} events
                </div>
              </div>
            </div>
          </Button>
        ))}
      </div>

      <div className="hidden md:block">
        <Table aria-label="Cycles">
          <TableHeader columns={CYCLE_TABLE_COLUMNS}>
            {(column) => (
              <TableColumn isRowHeader={column.id === 'cycle'}>
                {column.name}
              </TableColumn>
            )}
          </TableHeader>
          <TableBody items={cycles}>
            {(cycle) => (
              <TableRow
                key={cycle.id}
                id={cycle.id}
                columns={CYCLE_TABLE_COLUMNS}
                data-testid={`ministry-cycle-row-${cycle.id}`}
                onAction={() => onSelectCycle({ cycleId: cycle.id })}
              >
                {(column) => (
                  <TableCell>
                    {column.id === 'cycle' ? cycle.label : null}
                    {column.id === 'events' ? cycle.eventCount : null}
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
