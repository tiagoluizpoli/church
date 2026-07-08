import { Pencil, Trash2 } from 'lucide-react';
import { useTimezone } from '../../../../shared/hooks/use-timezone';
import type { GridSlotModel } from './builder-types';
import { RequirementCell } from './requirement-cell';
import { RoleCountControl } from './role-count-control';
import { StaffingMeter } from './staffing-meter';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SlotRowProps {
  slot: GridSlotModel;
  eventType: 'hourly' | 'day_based';
  isPublished: boolean;
  onAssign: (slotId: string, roleId: string, volunteerId: string) => void;
  onRemove: (assignmentId: string) => void;
  onOverride: (assignmentId: string) => void;
  onSubstitute: (assignmentId: string, roleId: string) => void;
  selectedVolunteerId?: string;
  selectedVolunteerName?: string;
  onIncrement: (slotId: string, roleId: string) => void;
  onDecrement: (slotId: string, roleId: string) => void;
  onEditSlot: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => void;
}

export function SlotRow({
  slot,
  eventType,
  isPublished,
  onAssign,
  onRemove,
  onOverride,
  onSubstitute,
  selectedVolunteerId,
  selectedVolunteerName,
  onIncrement,
  onDecrement,
  onEditSlot,
  onDeleteSlot,
}: SlotRowProps) {
  const { format } = useTimezone();

  const allFilled = slot.fillRatio >= 1;

  const label =
    eventType === 'day_based'
      ? (slot.label ?? `Day ${slot.dayIndex}`)
      : `${format(slot.startTime, 'p')} – ${format(slot.endTime, 'p')}`;

  return (
    <div
      className={cn(
        'grid grid-cols-[12rem_1fr] gap-2 border-b py-2',
        allFilled && 'bg-green-50/60',
      )}
      data-testid="slot-row"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-1">
          <span className="font-medium text-sm">{label}</span>
          {!isPublished && (
            <span className="flex items-center gap-0.5">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-5"
                onClick={() => onEditSlot(slot.slotId)}
                aria-label="Edit slot"
              >
                <Pencil className="size-3" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-5"
                onClick={() => onDeleteSlot(slot.slotId)}
                aria-label="Delete slot"
              >
                <Trash2 className="size-3" />
              </Button>
            </span>
          )}
          {isPublished && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="text-muted-foreground text-xs">🔒</span>
                }
              />
              <TooltipContent>
                Slot structure is locked after publishing
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <StaffingMeter fillRatio={slot.fillRatio} variant="slot" />
      </div>

      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${slot.columns.length}, minmax(8rem, 1fr))`,
        }}
      >
        {slot.columns.map((col) => {
          const readOnly = col.isReadOnly;
          return (
            <div key={col.roleId} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-1 text-muted-foreground text-xs">
                <span className="truncate">{col.roleName}</span>
                {!isPublished && !readOnly && (
                  <RoleCountControl
                    count={col.requiredCount}
                    onIncrement={() => onIncrement(slot.slotId, col.roleId)}
                    onDecrement={() => onDecrement(slot.slotId, col.roleId)}
                  />
                )}
              </div>

              {col.cells.map((cell) => {
                const { assignment } = cell;
                return (
                  <RequirementCell
                    key={`${cell.roleId}-${cell.fillIndex}`}
                    slotId={cell.slotId}
                    roleId={cell.roleId}
                    fillIndex={cell.fillIndex}
                    assignment={assignment}
                    suggestions={cell.suggestions}
                    pickerVolunteers={cell.pickerVolunteers}
                    isReadOnly={readOnly}
                    isPublished={isPublished}
                    selectedVolunteerId={selectedVolunteerId}
                    selectedVolunteerName={selectedVolunteerName}
                    onAssign={(volunteerId) =>
                      onAssign(cell.slotId, cell.roleId, volunteerId)
                    }
                    onAssignSelectedVolunteer={
                      selectedVolunteerId
                        ? () =>
                            onAssign(
                              cell.slotId,
                              cell.roleId,
                              selectedVolunteerId,
                            )
                        : undefined
                    }
                    onRemove={() => assignment && onRemove(assignment.id)}
                    onOverride={
                      assignment ? () => onOverride(assignment.id) : undefined
                    }
                    onSubstitute={
                      assignment
                        ? () => onSubstitute(assignment.id, cell.roleId)
                        : undefined
                    }
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
