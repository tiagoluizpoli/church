import { Badge } from '@church/ui/components/badge';
import { Button } from '@church/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@church/ui/components/card';
import { Input } from '@church/ui/components/input';
import { Label } from '@church/ui/components/label';
import {
  cycleIsLocked,
  formatCycleDate,
  parsePlanningEventType,
  stateBadgeVariant,
} from './planning-admin.utils';
import { useCycleReviewCard } from './planning-admin-context';
import { PlanningEventCard } from './planning-event-card';

export function CycleReviewCard() {
  const {
    selectedCycleId,
    selectedCycle,
    cycleDetailsLoading,
    totalSlots,
    cycleEvents,
    planningEventForm,
    canCreatePlanningEvent,
    createPlanningEventPending,
    lockCyclePending,
    handlePlanningEventTitleChange,
    handlePlanningEventStartChange,
    handlePlanningEventEndChange,
    handlePlanningEventTypeChange,
    handleCreatePlanningEvent,
    handleLockCycle,
  } = useCycleReviewCard();

  return (
    <Card>
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
              className="flex flex-wrap items-center justify-between gap-3 border p-3"
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
              <Badge
                data-testid="selected-cycle-state"
                variant={stateBadgeVariant({ state: selectedCycle.state })}
              >
                {selectedCycle.state}
              </Badge>
            </div>

            <div className="space-y-3 border p-3">
              <div className="font-medium text-sm">Add manual event</div>
              <div className="space-y-1">
                <Label htmlFor="planning-event-title">Title</Label>
                <Input
                  id="planning-event-title"
                  data-testid="planning-event-title-input"
                  value={planningEventForm.title}
                  onChange={(event) =>
                    handlePlanningEventTitleChange({
                      value: event.target.value,
                    })
                  }
                  placeholder="Retreat weekend"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="planning-event-start">Start</Label>
                  <Input
                    id="planning-event-start"
                    data-testid="planning-event-start-input"
                    type="datetime-local"
                    value={planningEventForm.startDateTime}
                    onChange={(event) =>
                      handlePlanningEventStartChange({
                        value: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="planning-event-end">End</Label>
                  <Input
                    id="planning-event-end"
                    data-testid="planning-event-end-input"
                    type="datetime-local"
                    value={planningEventForm.endDateTime}
                    onChange={(event) =>
                      handlePlanningEventEndChange({
                        value: event.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="planning-event-type">Event type</Label>
                <select
                  id="planning-event-type"
                  data-testid="planning-event-type-select"
                  className="flex h-8 w-full border bg-background px-2.5 text-sm"
                  value={planningEventForm.eventType}
                  onChange={(event) => {
                    const planningEventType = parsePlanningEventType({
                      value: event.target.value,
                    });

                    if (planningEventType) {
                      handlePlanningEventTypeChange({
                        eventType: planningEventType,
                      });
                    }
                  }}
                >
                  <option value="day_based">Day-based</option>
                  <option value="hourly">Hourly</option>
                </select>
              </div>
              <Button
                type="button"
                data-testid="create-planning-event-button"
                disabled={!canCreatePlanningEvent || createPlanningEventPending}
                onClick={handleCreatePlanningEvent}
              >
                {createPlanningEventPending ? 'Adding…' : 'Add manual event'}
              </Button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-sm">Calendar review</div>
                <Button
                  type="button"
                  data-testid="lock-cycle-button"
                  disabled={
                    cycleIsLocked({ cycle: selectedCycle }) || lockCyclePending
                  }
                  onClick={handleLockCycle}
                >
                  {lockCyclePending
                    ? 'Locking…'
                    : cycleIsLocked({ cycle: selectedCycle })
                      ? 'Locked'
                      : 'Lock cycle'}
                </Button>
              </div>

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
