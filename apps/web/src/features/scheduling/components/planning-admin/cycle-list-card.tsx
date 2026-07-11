import {
  formatCycleDate,
  stateBadgeVariant,
  toPlanningCyclesTableRow,
} from './planning-admin.utils';
import { useCycleListCard } from './planning-admin-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface SelectCycleInput {
  cycleId: string;
}

interface CycleListCardProps {
  onSelectCycle?: (input: SelectCycleInput) => void;
  selectedCycleId?: string | null;
}

const CYCLE_TABLE_COLUMNS = [
  { id: 'name', name: 'Name' },
  { id: 'window', name: 'Window' },
  { id: 'status', name: 'Status' },
] as const;

export function CycleListCard({
  onSelectCycle,
  selectedCycleId = null,
}: CycleListCardProps) {
  const { cycles, cyclesLoading, handleSelectCycle } = useCycleListCard();

  return (
    <Card className="surface-panel">
      <CardHeader>
        <CardTitle>Existing cycles</CardTitle>
        <CardDescription>
          Select a cycle to review, add events, apply templates, or lock it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {cyclesLoading ? (
          <p className="text-muted-foreground text-sm">Loading cycles…</p>
        ) : cycles.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No cycles yet. Create the first one to begin.
          </p>
        ) : (
          <>
            <div className="space-y-3 md:hidden" role="listbox">
              {cycles.map((cycle) => (
                <Button
                  key={cycle.id}
                  type="button"
                  variant="ghost"
                  role="option"
                  data-testid="planning-cycle-option"
                  aria-selected={selectedCycleId === cycle.id}
                  className={cn(
                    'surface-subtle workspace-panel h-auto w-full items-stretch justify-start whitespace-normal p-0 text-left font-normal',
                    selectedCycleId === cycle.id &&
                      'border-primary/30 bg-accent/45',
                  )}
                  onClick={() => {
                    handleSelectCycle({ cycleId: cycle.id });
                    onSelectCycle?.({ cycleId: cycle.id });
                  }}
                >
                  <div className="flex w-full items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium">{cycle.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {formatCycleDate({ date: cycle.startDate })} →{' '}
                        {formatCycleDate({ date: cycle.endDate })}
                      </div>
                    </div>
                    <Badge variant={stateBadgeVariant({ state: cycle.state })}>
                      {cycle.state}
                    </Badge>
                  </div>
                </Button>
              ))}
            </div>

            <div className="hidden md:block">
              <Table aria-label="Existing cycles">
                <TableHeader columns={CYCLE_TABLE_COLUMNS}>
                  {(column) => (
                    <TableColumn isRowHeader={column.id === 'name'}>
                      {column.name}
                    </TableColumn>
                  )}
                </TableHeader>
                <TableBody
                  items={cycles.map((cycle) =>
                    toPlanningCyclesTableRow({ cycle }),
                  )}
                >
                  {(row) => (
                    <TableRow
                      key={row.id}
                      id={row.id}
                      columns={CYCLE_TABLE_COLUMNS}
                      className={
                        selectedCycleId === row.id ? 'bg-accent/45' : undefined
                      }
                      onAction={() => {
                        handleSelectCycle({ cycleId: row.id });
                        onSelectCycle?.({ cycleId: row.id });
                      }}
                    >
                      {(column) => (
                        <TableCell>
                          {column.id === 'name' ? row.name : null}
                          {column.id === 'window' ? row.window : null}
                          {column.id === 'status' ? (
                            <Badge
                              variant={stateBadgeVariant({ state: row.state })}
                            >
                              {row.state}
                            </Badge>
                          ) : null}
                        </TableCell>
                      )}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
