import { useState } from 'react';
import { QuickCreateEventModal } from '../quick-create-event-modal';
import { formatCycleDate } from './planning-admin.utils';
import { useCycleReviewCard } from './planning-admin-context';
import { PlanningEventCard } from './planning-event-card';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface CycleReviewCardProps {
  isReadOnly: boolean;
}

export function CycleReviewCard({ isReadOnly }: CycleReviewCardProps) {
  const {
    selectedCycleId,
    selectedCycle,
    cycleDetailsLoading,
    totalSlots,
    cycleEvents,
    lockCyclePending,
    handleLockCycle,
  } = useCycleReviewCard();
  const [createEventOpen, setCreateEventOpen] = useState(false);

  return (
    <Card className="surface-panel">
      <CardHeader>
        <CardTitle>Selected cycle review</CardTitle>
        <CardDescription>
          Add one-off events, review the generated calendar, then lock the cycle
          when leaders can start staffing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!selectedCycleId ? (
          <p className="text-muted-foreground text-sm">
            Select or create a cycle to continue.
          </p>
        ) : cycleDetailsLoading ? (
          <p className="text-muted-foreground text-sm">
            Loading cycle details…
          </p>
        ) : selectedCycle ? (
          <>
            <div
              className="surface-subtle workspace-panel flex flex-wrap items-center justify-between gap-3"
              data-testid="selected-cycle-summary"
            >
              <div className="space-y-1">
                <div className="font-medium" data-testid="selected-cycle-name">
                  {selectedCycle.name}
                </div>
                <div className="text-muted-foreground text-xs">
                  {formatCycleDate({ date: selectedCycle.startDate })} →{' '}
                  {formatCycleDate({ date: selectedCycle.endDate })}
                </div>
                <div className="text-muted-foreground text-xs">
                  {cycleEvents.length} events · {totalSlots} slots
                </div>
              </div>
            </div>

            {!isReadOnly ? (
              <div className="surface-subtle workspace-panel">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">Manual exceptions</div>
                    <div className="text-muted-foreground text-sm">
                      Add retreats, special services, and other one-off events
                      without leaving the cycle review.
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setCreateEventOpen(true)}
                  >
                    Add manual event
                  </Button>
                </div>
                <QuickCreateEventModal
                  open={createEventOpen}
                  onOpenChange={setCreateEventOpen}
                  target={{ kind: 'planning-cycle', cycleId: selectedCycle.id }}
                  onCreated={() => undefined}
                />
              </div>
            ) : null}

            <div className="space-y-3">
              {isReadOnly ? (
                <div className="font-medium text-sm">Calendar review</div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-sm">Calendar review</div>
                    <div className="text-muted-foreground text-xs">
                      Confirm dates, slots, and event types before locking the
                      package.
                    </div>
                  </div>
                  <Button
                    type="button"
                    data-testid="lock-cycle-button"
                    disabled={lockCyclePending}
                    onClick={handleLockCycle}
                  >
                    {lockCyclePending ? 'Locking…' : 'Lock cycle'}
                  </Button>
                </div>
              )}

              {cycleEvents.length > 0 ? (
                <div className="space-y-3" data-testid="planning-events-list">
                  {cycleEvents.map((eventGroup) => (
                    <PlanningEventCard
                      key={eventGroup.event.id}
                      eventGroup={eventGroup}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No events in this cycle yet. Apply templates or add a manual
                  event.
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Pick a cycle to review its generated calendar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
