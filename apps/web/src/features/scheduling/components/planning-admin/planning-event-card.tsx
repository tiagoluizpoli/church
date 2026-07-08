import type { PlanningCycleEventGroup } from './planning-admin.types';
import {
  eventStatusBadgeVariant,
  formatEventDateTime,
} from './planning-admin.utils';
import { Badge } from '@/components/ui/badge';

export interface PlanningEventCardProps {
  eventGroup: PlanningCycleEventGroup;
}

export function PlanningEventCard({ eventGroup }: PlanningEventCardProps) {
  return (
    <div
      className="surface-subtle workspace-panel"
      data-testid="planning-event-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="font-medium text-base">{eventGroup.event.title}</div>
          <div className="text-muted-foreground text-xs">
            {formatEventDateTime({ date: eventGroup.event.startDate })} →{' '}
            {formatEventDateTime({ date: eventGroup.event.endDate })}
          </div>
          <div className="text-muted-foreground text-xs">
            {eventGroup.event.eventType} · {eventGroup.slots.length} slot
            {eventGroup.slots.length === 1 ? '' : 's'}
          </div>
        </div>
        <Badge
          variant={eventStatusBadgeVariant({ status: eventGroup.event.status })}
        >
          {eventGroup.event.status}
        </Badge>
      </div>
      {eventGroup.slots.length > 0 ? (
        <ul className="mt-3 space-y-1 text-muted-foreground text-xs">
          {eventGroup.slots.map((slot) => (
            <li key={slot.id} data-testid="planning-slot-item">
              {slot.label ?? 'Slot'} ·{' '}
              {formatEventDateTime({ date: slot.startTime })} →{' '}
              {formatEventDateTime({ date: slot.endTime })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
