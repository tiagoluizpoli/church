import { Badge } from '@church/ui/components/badge';
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
}

export function VolunteerCard({ volunteer }: VolunteerCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `volunteer-${volunteer.volunteerId}`,
      data: { volunteerId: volunteer.volunteerId },
    });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'flex cursor-grab items-center justify-between gap-2 rounded border bg-card px-2 py-1.5 text-xs active:cursor-grabbing',
        isDragging && 'opacity-50',
      )}
      data-testid="volunteer-card"
    >
      <span className="truncate">
        {formatVolunteerName(volunteer.volunteerName)}
      </span>
      <span className="flex items-center gap-1">
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
