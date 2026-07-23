import { useDraggable } from '@dnd-kit/core';
import type {
  AvailabilityStatus,
  VolunteerPoolItem,
} from '../../hooks/use-volunteer-pool';
import { AssigneeIdentityBadge } from './assignee-identity-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFormControlSize } from '@/components/ui/form-control-size';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatAssigneeRoleLabel } from '@/utils/format-assignee-role-label';
import { formatVolunteerName } from '@/utils/format-volunteer-name';

const STATUS_STYLE: Record<AvailabilityStatus, string> = {
  available: 'bg-primary/10 text-primary',
  partial: 'bg-muted text-muted-foreground',
  unavailable: 'bg-muted text-muted-foreground',
  // biome-ignore lint/style/useNamingConvention: AvailabilityStatus snake_case from domain/DB
  no_response: 'bg-muted text-muted-foreground',
};

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  available: 'Available',
  partial: 'Partial',
  unavailable: 'Unavailable',
  // biome-ignore lint/style/useNamingConvention: AvailabilityStatus snake_case from domain/DB
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
  const isTouch = useFormControlSize() === 'touch';
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `volunteer-${volunteer.volunteerId}`,
      data: {
        volunteerId: volunteer.volunteerId,
        volunteerName: volunteer.volunteerName,
        systemRole: volunteer.systemRole,
        status: volunteer.status,
        workloadCount: volunteer.workloadCount,
        conflictReason: volunteer.conflictReason,
      },
      disabled: isOverlay,
    });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const roleLabel = formatAssigneeRoleLabel(volunteer.systemRole);

  return (
    <div
      className={cn(
        'radius-control flex items-center justify-between gap-2 border bg-card px-2 py-1.5 text-xs',
        isTouch && 'min-h-11 px-3 py-2 text-sm',
        isSelected && 'border-primary bg-primary/5 ring-1 ring-primary',
        isDragging && 'opacity-50',
        isOverlay && 'shadow-lg',
      )}
    >
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: dnd-kit's spread
          `attributes` sets role="button" at runtime, invisible to static
          analysis here — aria-label disambiguates two same-truncating names
          (FR-013) for the screen-reader-exposed name of this draggable. */}
      <div
        ref={isOverlay ? undefined : setNodeRef}
        style={isOverlay ? undefined : style}
        {...(isOverlay ? {} : listeners)}
        {...(isOverlay ? {} : attributes)}
        className={cn(
          'radius-control min-w-0 flex-1 cursor-grab active:cursor-grabbing',
          !isOverlay &&
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        data-testid="volunteer-card"
        aria-label={
          roleLabel ? `${volunteer.volunteerName}, ${roleLabel}` : undefined
        }
      >
        {formatVolunteerName(volunteer.volunteerName)}
        {volunteer.qualifiedRoleNames?.length ? (
          <p
            className="truncate text-[0.6875rem] text-muted-foreground leading-tight"
            data-testid="volunteer-qualified-roles"
          >
            {volunteer.qualifiedRoleNames.join(' · ')}
          </p>
        ) : null}
      </div>
      <span className="flex items-center gap-1">
        <AssigneeIdentityBadge
          roleLabel={roleLabel}
          fullNameOnExpand={volunteer.volunteerName}
        />
        {onSelect ? (
          <Button
            type="button"
            size={isTouch ? 'touch' : 'sm'}
            variant="ghost"
            className={isTouch ? 'px-3 text-sm' : 'h-5 px-1 text-xs'}
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
            {volunteer.conflictReason ??
              (volunteer.workloadCount > 0 && volunteer.status === 'available'
                ? `Available · already serving ${volunteer.workloadCount} slot(s) in this event`
                : STATUS_LABEL[volunteer.status])}
          </TooltipContent>
        </Tooltip>
        {volunteer.workloadCount > 0 && (
          <Badge
            className="bg-primary/10 text-primary"
            title="Already serving in this event"
          >
            Serving ({volunteer.workloadCount})
          </Badge>
        )}
      </span>
    </div>
  );
}
