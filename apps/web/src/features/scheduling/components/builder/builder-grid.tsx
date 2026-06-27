import { Button } from '@church/ui/components/button';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import type { ScheduleBuilderData } from '../../hooks/use-schedule-builder';
import { mapAvailabilityStatus } from '../../utils/availability-status';
import type { ConfirmationStatus, ConflictStatus } from './assignment-chip';
import type { PickerVolunteer } from './assignment-picker';
import type {
  GridCellModel,
  GridRoleColumn,
  GridSlotModel,
} from './builder-types';
import { SlotRow } from './slot-row';

interface BuilderGridProps {
  data: ScheduleBuilderData;
  callerTeamId: string | null;
  onAssign: (slotId: string, roleId: string, volunteerId: string) => void;
  onRemove: (assignmentId: string) => void;
  onOverride: (slotId: string, roleId: string, volunteerId: string) => void;
  onSubstitute: (assignmentId: string, roleId: string) => void;
  onIncrement: (slotId: string, roleId: string) => void;
  onDecrement: (slotId: string, roleId: string) => void;
  onEditSlot: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => void;
  onAddSlot: () => void;
}

type Avail = ScheduleBuilderData['volunteerAvailability'][number];

interface TimeRangeMs {
  start: number;
  end: number;
}

function timesOverlap(a: TimeRangeMs, b: TimeRangeMs) {
  return a.start < b.end && a.end > b.start;
}

export function BuilderGrid({
  data,
  callerTeamId,
  onAssign,
  onRemove,
  onOverride,
  onSubstitute,
  onIncrement,
  onDecrement,
  onEditSlot,
  onDeleteSlot,
  onAddSlot,
}: BuilderGridProps) {
  const isPublished = data.event.status === 'published';
  const eventType = data.event.eventType;

  const slotModels = useMemo<GridSlotModel[]>(() => {
    const availByVol = new Map<string, Avail>(
      data.volunteerAvailability.map((v) => [v.volunteerId, v]),
    );

    // Workload per volunteer (active assignments only).
    const workload = new Map<string, number>();
    for (const a of data.assignments) {
      if (a.status === 'cancelled' || a.status === 'declined') continue;
      workload.set(a.volunteerId, (workload.get(a.volunteerId) ?? 0) + 1);
    }

    // Slot time lookup for double-booking detection.
    const slotTimes = new Map<string, TimeRangeMs>(
      data.slots.map((s) => [
        s.id,
        {
          start: new Date(s.startTime).getTime(),
          end: new Date(s.endTime).getTime(),
        },
      ]),
    );

    const activeBySlot = new Map<string, ScheduleBuilderData['assignments']>();
    for (const a of data.assignments) {
      if (a.status === 'cancelled') continue;
      const list = activeBySlot.get(a.slotId) ?? [];
      list.push(a);
      activeBySlot.set(a.slotId, list);
    }

    const conflictFor = (
      volunteerId: string,
      slotId: string,
    ): ConflictStatus | undefined => {
      const av = availByVol.get(volunteerId);
      if (av && mapAvailabilityStatus(av.status) === 'unavailable')
        return 'unavailable';
      // double-booked: another active assignment in an overlapping slot
      const thisTimes = slotTimes.get(slotId);
      if (!thisTimes) return undefined;
      const others = data.assignments.filter(
        (a) =>
          a.volunteerId === volunteerId &&
          a.slotId !== slotId &&
          a.status !== 'cancelled' &&
          a.status !== 'declined',
      );
      for (const o of others) {
        const t = slotTimes.get(o.slotId);
        if (t && timesOverlap(thisTimes, t)) return 'double_booked';
      }
      return undefined;
    };

    return data.slots.map((slot, idx) => {
      const slotReqs = data.requirements.filter((r) => r.slotId === slot.id);
      const slotAssignments = (activeBySlot.get(slot.id) ?? []).filter(
        (a) => a.status !== 'declined',
      );

      const columns: GridRoleColumn[] = data.roles.map((role) => {
        const req = slotReqs.find((r) => r.roleId === role.id);
        const requiredCount = req?.requiredCount ?? 0;
        // US6: a sub-leader (callerTeamId set) may only edit cells whose
        // requirement belongs to their team; all others are read-only.
        const isReadOnly =
          callerTeamId != null && (req?.teamId ?? null) !== callerTeamId;

        const roleAssignments = slotAssignments.filter(
          (a) => a.roleId === role.id,
        );

        // Suggestions for empty fills: available→partial, least-assigned, top 3.
        const assignedVolIds = new Set(
          roleAssignments.map((a) => a.volunteerId),
        );
        const suggestions = data.volunteerAvailability
          .map((v) => ({ ...v, uiStatus: mapAvailabilityStatus(v.status) }))
          .filter(
            (v) =>
              (v.uiStatus === 'available' || v.uiStatus === 'partial') &&
              !assignedVolIds.has(v.volunteerId),
          )
          .sort((a, b) => {
            if (a.uiStatus !== b.uiStatus)
              return a.uiStatus === 'available' ? -1 : 1;
            return (
              (workload.get(a.volunteerId) ?? 0) -
              (workload.get(b.volunteerId) ?? 0)
            );
          })
          .slice(0, 3)
          .map((v) => ({
            id: v.volunteerId,
            name: v.volunteerName,
            status: v.uiStatus as 'available' | 'partial',
            workloadCount: workload.get(v.volunteerId) ?? 0,
          }));

        const pickerVolunteers: PickerVolunteer[] =
          data.volunteerAvailability.map((v) => ({
            id: v.volunteerId,
            name: v.volunteerName,
            availabilityStatus: mapAvailabilityStatus(v.status),
            alreadyAssignedCount: workload.get(v.volunteerId) ?? 0,
          }));

        const cells: GridCellModel[] = [];
        const fillCount = Math.max(requiredCount, roleAssignments.length);
        for (let i = 0; i < fillCount; i++) {
          const a = roleAssignments[i];
          cells.push({
            slotId: slot.id,
            roleId: role.id,
            fillIndex: i,
            assignment: a
              ? {
                  id: a.id,
                  volunteerId: a.volunteerId,
                  volunteerName: a.volunteerName ?? a.volunteerId,
                  conflictStatus: conflictFor(a.volunteerId, slot.id),
                  confirmationStatus: ([
                    'pending',
                    'confirmed',
                    'declined',
                  ].includes(a.status)
                    ? a.status
                    : undefined) as ConfirmationStatus | undefined,
                }
              : undefined,
            suggestions,
            pickerVolunteers,
          });
        }

        return {
          roleId: role.id,
          roleName: role.name,
          requiredCount,
          isReadOnly,
          cells,
        };
      });

      // Per-slot fill ratio (FR-050: conflicted assignments still count).
      const totalRequired = slotReqs.reduce((s, r) => s + r.requiredCount, 0);
      const fillRatio =
        totalRequired === 0 ? 0 : slotAssignments.length / totalRequired;

      return {
        slotId: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        label: slot.label,
        dayIndex: idx + 1,
        fillRatio,
        columns,
      };
    });
  }, [data, callerTeamId]);

  return (
    <div className="flex flex-col" data-testid="builder-grid">
      {slotModels.map((slot) => (
        <SlotRow
          key={slot.slotId}
          slot={slot}
          eventType={eventType}
          isPublished={isPublished}
          onAssign={onAssign}
          onRemove={onRemove}
          onOverride={onOverride}
          onSubstitute={onSubstitute}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
          onEditSlot={onEditSlot}
          onDeleteSlot={onDeleteSlot}
        />
      ))}

      {!isPublished && (
        <div className="pt-3">
          <Button type="button" variant="outline" size="sm" onClick={onAddSlot}>
            <Plus className="mr-1 size-3" /> Add slot
          </Button>
        </div>
      )}
    </div>
  );
}
