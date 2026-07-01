import { Badge } from '@church/ui/components/badge';
import { Button } from '@church/ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@church/ui/components/tooltip';
import { cn } from '@church/ui/lib/utils';
import { useDraggable } from '@dnd-kit/core';
import type {
  AvailabilityStatus,
  VolunteerPoolItem,
} from '../../hooks/use-volunteer-pool';
import { formatVolunteerName } from '@/utils/format-volunteer-name';

const STATUS_STYLE: Record<AvailabilityStatus, string> = {
  available: 'bg-green-700 text-white',
  partial: 'bg-yellow-500 text-black',
  unavailable: 'bg-red-600 text-white',
  no_response: 'bg-gray-600 text-white',
};

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  available: 'Available',
  partial: 'Partial',
  unavailable: 'Unavailable',
  no_response: 'No response',
};

interface VolunteerCardProps {
  volunteer: VolunteerPoolItem;
  isSelected?: boolean;
  isOverlay?: boolean;
  onSelect?: (volunteerId: string) => void;
}

export function VolunteerCard({
  volunteer,
  isSelected = false,
  isOverlay = false,
  onSelect,
}: VolunteerCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `volunteer-${volunteer.volunteerId}`,
      data: {
        volunteerId: volunteer.volunteerId,
        volunteerName: volunteer.volunteerName,
        status: volunteer.status,
        workloadCount: volunteer.workloadCount,
        conflictReason: volunteer.conflictReason,
      },
      disabled: isOverlay,
    });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded border bg-card px-2 py-1.5 text-xs',
        isSelected && 'border-primary bg-primary/5 ring-1 ring-primary',
        isDragging && 'opacity-50',
        isOverlay && 'shadow-lg',
      )}
    >
      <div
        ref={isOverlay ? undefined : setNodeRef}
        style={isOverlay ? undefined : style}
        {...(isOverlay ? {} : listeners)}
        {...(isOverlay ? {} : attributes)}
        className={cn(
          'min-w-0 flex-1 cursor-grab rounded-sm active:cursor-grabbing',
          !isOverlay &&
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        data-testid="volunteer-card"
      >
        {formatVolunteerName(volunteer.volunteerName)}
      </div>
      <span className="flex items-center gap-1">
        {onSelect ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-5 px-1 text-xs"
            onClick={() => onSelect(volunteer.volunteerId)}
          >
            Select slot
          </Button>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Badge className={STATUS_STYLE[volunteer.status]}>
                {STATUS_LABEL[volunteer.status]}
              </Badge>
            }
          />
          <TooltipContent>
            {volunteer.conflictReason ?? STATUS_LABEL[volunteer.status]}
          </TooltipContent>
        </Tooltip>
        <Badge className="bg-muted text-muted-foreground" title="Workload">
          {volunteer.workloadCount}
        </Badge>
      </span>
    </div>
  );
}
