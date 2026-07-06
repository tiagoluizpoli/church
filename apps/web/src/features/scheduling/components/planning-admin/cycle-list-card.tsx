import { Badge } from '@church/ui/components/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@church/ui/components/card';
import { formatCycleDate, stateBadgeVariant } from './planning-admin.utils';
import { useCycleListCard } from './planning-admin-context';

export function CycleListCard() {
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
          cycles.map((cycle) => (
            <button
              key={cycle.id}
              type="button"
              data-testid="planning-cycle-option"
              className="surface-subtle workspace-panel w-full text-left transition-colors hover:bg-accent/60"
              onClick={() => handleSelectCycle({ cycleId: cycle.id })}
            >
              <div className="flex items-start justify-between gap-3">
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
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
