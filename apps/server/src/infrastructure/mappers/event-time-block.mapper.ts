import type { eventTimeBlock, shiftRequirement } from '@church/db';
import { fromDate } from '@church/time';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  ChurchId,
  EventId,
  EventTimeBlockId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
  TemplateTimeBlockId,
} from '../../domain/branded-ids';
import type { EventTimeBlockProps } from '../../domain/entities/event-time-block';
import { EventTimeBlock } from '../../domain/entities/event-time-block';
import type {
  ShiftRequirementId,
  ShiftRequirementProps,
} from '../../domain/entities/shift-requirement';
import { ShiftRequirement } from '../../domain/entities/shift-requirement';

type EventTimeBlockRow = InferSelectModel<typeof eventTimeBlock>;
type ShiftRequirementRow = InferSelectModel<typeof shiftRequirement>;

export function mapShiftRequirement(
  row: ShiftRequirementRow,
  eventTimeBlockId?: string,
): ShiftRequirement {
  const props: ShiftRequirementProps = {
    churchId: row.churchId as ChurchId,
    participationId: row.participationId as MinistryParticipationId,
    shiftId: row.shiftId as ShiftId,
    eventTimeBlockId: (eventTimeBlockId ?? row.shiftId) as EventTimeBlockId,
    roleId: row.roleId as RoleId,
    teamId: row.teamId
      ? (row.teamId as ShiftRequirementProps['teamId'])
      : undefined,
    peopleNeeded: row.peopleNeeded,
    notes: row.notes ?? undefined,
  };

  return new ShiftRequirement(props, row.id as ShiftRequirementId);
}

export function mapEventTimeBlock(
  row: EventTimeBlockRow,
  requirements: ShiftRequirement[] = [],
): EventTimeBlock {
  const props: EventTimeBlockProps = {
    churchId: row.churchId as ChurchId,
    eventId: row.eventId as EventId,
    sourceTemplateTimeBlockId:
      (row.sourceTemplateTimeBlockId as TemplateTimeBlockId | null) ??
      undefined,
    startTime: fromDate({ date: row.startTime }),
    endTime: fromDate({ date: row.endTime }),
    label: row.label ?? undefined,
    status: 'active',
    requirements,
  };

  return new EventTimeBlock(
    props,
    row.id as EventTimeBlockId,
    row.createdAt,
    row.createdAt,
  );
}
