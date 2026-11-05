import { m } from '@church/i18n/messages';
import { useState } from 'react';
import type { CyclesTableRow } from './planning-admin.types';
import {
  groupCyclesForList,
  stateBadgeVariant,
  toCyclesTableRow,
} from './planning-admin.utils';
import { useCycleListCard } from './planning-admin-context';
import { RetryAlert } from './retry-alert';
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
  /** Opens the New cycle dialog; the list never changes the URL for it. */
  onNewCycle?: () => void;
  onSelectCycle?: (input: SelectCycleInput) => void;
  selectedCycleId?: string | null;
}

interface CycleTableProps {
  label: string;
  rows: CyclesTableRow[];
  selectedCycleId: string | null;
  onSelect: (input: SelectCycleInput) => void;
}

function cycleColumns(): DataTableColumn[] {
  return [
    { id: 'name', name: m.cycles_column_name(), isRowHeader: true },
    { id: 'window', name: m.cycles_column_window() },
    { id: 'status', name: m.cycles_column_status() },
  ];
}

interface StateBadgeProps {
  state: CyclesTableRow['state'];
}

function StateBadge({ state }: StateBadgeProps) {
  return (
    <Badge variant={stateBadgeVariant({ state })}>
      {state === 'draft' ? m.cycles_state_draft() : null}
      {state === 'sent' ? m.cycles_state_sent() : null}
      {state === 'past' ? m.cycles_state_past() : null}
    </Badge>
  );
}

function CycleTable({
  label,
  rows,
  selectedCycleId,
  onSelect,
}: CycleTableProps) {
  return (
    <DataTable
      aria-label={label}
      columns={cycleColumns()}
      items={rows}
      rowId={({ item }) => item.id}
      rowTestId={({ item }) => `cycle-row-${item.id}`}
      selectionMode="single"
      selectionBehavior="replace"
      disallowEmptySelection
      selectedKeys={selectedCycleId ? new Set([selectedCycleId]) : new Set()}
      onSelectionChange={(keys) => {
        if (keys === 'all') return;
        const cycleId = keys.values().next().value;
        if (typeof cycleId !== 'string') return;
        onSelect({ cycleId });
      }}
      renderCell={({ item, column }) => (
        <>
          {column.id === 'name' ? item.name : null}
          {column.id === 'window' ? item.window : null}
          {column.id === 'status' ? <StateBadge state={item.state} /> : null}
        </>
      )}
      renderMobileCard={({ item }) => (
        <Button
          type="button"
          variant="ghost"
          role="option"
          data-testid="cycle-option"
          aria-selected={selectedCycleId === item.id}
          className={cn(
            'surface-subtle workspace-panel h-auto w-full items-stretch justify-start whitespace-normal p-0 text-left font-normal',
            selectedCycleId === item.id && 'border-primary/30 bg-accent/45',
          )}
          onClick={() => onSelect({ cycleId: item.id })}
        >
          <div className="flex w-full items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="font-medium">{item.name}</div>
              <div className="text-muted-foreground text-xs">{item.window}</div>
            </div>
            <StateBadge state={item.state} />
          </div>
        </Button>
      )}
    />
  );
}

export function CycleListCard({
  onNewCycle,
  onSelectCycle,
  selectedCycleId: selectedCycleIdOverride,
}: CycleListCardProps) {
  const {
    cycles,
    cyclesLoading,
    cyclesError,
    refetchCycles,
    selectedCycleId: selectedCycleIdFromContext,
    handleSelectCycle,
  } = useCycleListCard();
  const [pastOpen, setPastOpen] = useState(false);
  const selectedCycleId = selectedCycleIdOverride ?? selectedCycleIdFromContext;
  const { current, past } = groupCyclesForList({ cycles });

  const selectCycle = ({ cycleId }: SelectCycleInput) => {
    handleSelectCycle({ cycleId });
    onSelectCycle?.({ cycleId });
  };
  const toRows = (list: typeof cycles) =>
    list.map((cycle) => toCyclesTableRow({ cycle }));

  return (
    <Card className="surface-panel">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle>{m.cycles_list_title()}</CardTitle>
          <CardDescription>{m.cycles_list_description()}</CardDescription>
        </div>
        {onNewCycle && !cyclesError ? (
          <Button
            type="button"
            data-testid="open-create-cycle-dialog-button"
            onClick={onNewCycle}
          >
            {m.cycles_new()}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {cyclesLoading ? (
          <p className="text-muted-foreground text-sm">{m.cycles_loading()}</p>
        ) : cyclesError ? (
          <RetryAlert
            message={m.cycles_load_failed()}
            testId="cycles-load-error"
            onRetry={refetchCycles}
          />
        ) : cycles.length === 0 ? (
          <div className="space-y-3" data-testid="cycles-empty">
            <p className="text-muted-foreground text-sm">{m.cycles_empty()}</p>
            {onNewCycle ? (
              <Button type="button" onClick={onNewCycle}>
                {m.cycles_new()}
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            {current.length > 0 ? (
              <CycleTable
                label={m.cycles_current_heading()}
                rows={toRows(current)}
                selectedCycleId={selectedCycleId}
                onSelect={selectCycle}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                {m.cycles_current_empty()}
              </p>
            )}
            {past.length > 0 ? (
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  aria-expanded={pastOpen}
                  aria-controls="past-cycles"
                  data-testid="toggle-past-cycles"
                  onClick={() => setPastOpen((open) => !open)}
                >
                  {pastOpen
                    ? m.cycles_past_hide()
                    : m.cycles_past_show({ count: past.length })}
                </Button>
                <div id="past-cycles" hidden={!pastOpen}>
                  {pastOpen ? (
                    <CycleTable
                      label={m.cycles_state_past()}
                      rows={toRows(past)}
                      selectedCycleId={selectedCycleId}
                      onSelect={selectCycle}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
