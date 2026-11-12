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
    { id: 'actions', name: m.cycles_column_actions() },
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
      renderCell={({ item, column }) => (
        <>
          {column.id === 'name' ? item.name : null}
          {column.id === 'window' ? item.window : null}
          {column.id === 'status' ? <StateBadge state={item.state} /> : null}
        </>
      )}
      rowActions={({ item }) => (
        <div className="flex justify-end">
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="min-h-11 min-w-11 md:min-h-0 md:min-w-0"
            aria-pressed={selectedCycleId === item.id}
            aria-label={m.cycles_select_label({ name: item.name })}
            onClick={() => onSelect({ cycleId: item.id })}
          >
            {selectedCycleId === item.id
              ? m.cycles_selected()
              : m.cycles_select()}
          </Button>
        </div>
      )}
      renderMobileCard={({ item }) => (
        <div
          data-testid="cycle-option"
          className={cn(
            'surface-subtle workspace-panel flex items-start justify-between gap-3',
            selectedCycleId === item.id && 'border-primary/30 bg-accent/45',
          )}
        >
          <div className="space-y-1">
            <div className="font-medium">{item.name}</div>
            <div className="text-muted-foreground text-xs">{item.window}</div>
          </div>
          <StateBadge state={item.state} />
        </div>
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
  const [announcedCycleId, setAnnouncedCycleId] = useState<string | null>(null);
  const selectedCycleId = selectedCycleIdOverride ?? selectedCycleIdFromContext;
  const announced = cycles.find((cycle) => cycle.id === announcedCycleId);
  const { current, past } = groupCyclesForList({ cycles });

  const selectCycle = ({ cycleId }: SelectCycleInput) => {
    handleSelectCycle({ cycleId });
    setAnnouncedCycleId(cycleId);
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
        {announced ? (
          <p role="status" className="sr-only">
            {m.cycles_selected_announcement({ name: announced.name })}
          </p>
        ) : null}
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
