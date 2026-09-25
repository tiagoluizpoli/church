import type { PlanningCyclesTableRow } from './planning-admin.types';
import {
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
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { cn } from '@/lib/utils';

interface SelectCycleInput {
  cycleId: string;
}

interface CycleListCardProps {
  onSelectCycle?: (input: SelectCycleInput) => void;
  selectedCycleId?: string | null;
}

const CYCLE_TABLE_COLUMNS: DataTableColumn[] = [
  { id: 'name', name: 'Name', isRowHeader: true },
  { id: 'window', name: 'Window' },
  { id: 'status', name: 'Status' },
];

export function CycleListCard({
  onSelectCycle,
  selectedCycleId: selectedCycleIdOverride,
}: CycleListCardProps) {
  const {
    cycles,
    cyclesLoading,
    selectedCycleId: selectedCycleIdFromContext,
    handleSelectCycle,
  } = useCycleListCard();
  const selectedCycleId = selectedCycleIdOverride ?? selectedCycleIdFromContext;

  const rows: PlanningCyclesTableRow[] = cycles.map((cycle) =>
    toPlanningCyclesTableRow({ cycle }),
  );

  const selectCycle = ({ cycleId }: SelectCycleInput) => {
    handleSelectCycle({ cycleId });
    onSelectCycle?.({ cycleId });
  };

  return (
    <Card className="surface-panel">
      <CardHeader>
        <CardTitle>Existing cycles</CardTitle>
        <CardDescription>
          Select a cycle to review, add events, apply templates, or lock it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <DataTable
          aria-label="Existing cycles"
          columns={CYCLE_TABLE_COLUMNS}
          items={rows}
          rowId={({ item }) => item.id}
          rowTestId={({ item }) => `planning-cycle-row-${item.id}`}
          isLoading={cyclesLoading}
          loadingContent={
            <p className="text-muted-foreground text-sm">Loading cycles…</p>
          }
          emptyContent={
            <p className="text-muted-foreground text-sm">
              No cycles yet. Create the first one to begin.
            </p>
          }
          selectionMode="single"
          selectionBehavior="replace"
          disallowEmptySelection
          selectedKeys={
            selectedCycleId ? new Set([selectedCycleId]) : new Set()
          }
          onSelectionChange={(keys) => {
            if (keys === 'all') return;
            const cycleId = keys.values().next().value;
            if (typeof cycleId !== 'string') return;
            selectCycle({ cycleId });
          }}
          renderCell={({ item, column }) => (
            <>
              {column.id === 'name' ? item.name : null}
              {column.id === 'window' ? item.window : null}
              {column.id === 'status' ? (
                <Badge variant={stateBadgeVariant({ state: item.state })}>
                  {item.state}
                </Badge>
              ) : null}
            </>
          )}
          renderMobileCard={({ item }) => (
            <Button
              type="button"
              variant="ghost"
              role="option"
              data-testid="planning-cycle-option"
              aria-selected={selectedCycleId === item.id}
              className={cn(
                'surface-subtle workspace-panel h-auto w-full items-stretch justify-start whitespace-normal p-0 text-left font-normal',
                selectedCycleId === item.id && 'border-primary/30 bg-accent/45',
              )}
              onClick={() => selectCycle({ cycleId: item.id })}
            >
              <div className="flex w-full items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {item.window}
                  </div>
                </div>
                <Badge variant={stateBadgeVariant({ state: item.state })}>
                  {item.state}
                </Badge>
              </div>
            </Button>
          )}
        />
      </CardContent>
    </Card>
  );
}
