import type { slotRequirement, timeSlot } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  ChurchId,
  EventId,
  RoleId,
  TimeSlotId,
} from '../../domain/branded-ids';
import type {
  SlotRequirementId,
  SlotRequirementProps,
} from '../../domain/entities/slot-requirement';
import { SlotRequirement } from '../../domain/entities/slot-requirement';
import type { TimeSlotProps } from '../../domain/entities/time-slot';
import { TimeSlot } from '../../domain/entities/time-slot';

type TimeSlotRow = InferSelectModel<typeof timeSlot>;
type SlotRequirementRow = InferSelectModel<typeof slotRequirement>;

export function mapSlotRequirement(row: SlotRequirementRow): SlotRequirement {
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
  row: TimeSlotRow,
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
