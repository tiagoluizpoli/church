import type { ChurchId } from '../../domain/entities/church';
import type { EventId } from '../../domain/entities/event';
import type { RoleId } from '../../domain/entities/role';
import type {
  SlotRequirementId,
  SlotRequirementProps,
} from '../../domain/entities/slot-requirement';
import { SlotRequirement } from '../../domain/entities/slot-requirement';
import type {
  TimeSlotId,
  TimeSlotProps,
} from '../../domain/entities/time-slot';
import { TimeSlot } from '../../domain/entities/time-slot';

export function mapSlotRequirement(row: {
  id: string;
  churchId: string;
  slotId: string;
  roleId: string;
  teamId: string | null;
  requiredCount: number;
  notes: string | null;
}): SlotRequirement {
  const props: SlotRequirementProps = {
    churchId: row.churchId as ChurchId,
    slotId: row.slotId as TimeSlotId,
    roleId: row.roleId as RoleId,
    teamId: row.teamId
      ? (row.teamId as SlotRequirementProps['teamId'])
      : undefined,
    requiredCount: row.requiredCount,
    notes: row.notes ?? undefined,
  };

  return new SlotRequirement(props, row.id as SlotRequirementId);
}

export function mapTimeSlot(
  row: {
    id: string;
    churchId: string;
    eventId: string;
    startTime: Date;
    endTime: Date;
    label: string | null;
    createdAt: Date;
  },
  requirements: SlotRequirement[] = [],
): TimeSlot {
  const props: TimeSlotProps = {
    churchId: row.churchId as ChurchId,
    eventId: row.eventId as EventId,
    startTime: row.startTime,
    endTime: row.endTime,
    label: row.label ?? undefined,
    status: 'active',
    requirements,
  };

  return new TimeSlot(
    props,
    row.id as TimeSlotId,
    row.createdAt,
    row.createdAt,
  );
}
