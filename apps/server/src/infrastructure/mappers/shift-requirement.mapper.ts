import type { shiftRequirement } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  ChurchId,
  EventTimeBlockId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
} from '../../domain/branded-ids';
import type {
  ShiftRequirementId,
  ShiftRequirementProps,
} from '../../domain/entities/shift-requirement';
import { ShiftRequirement } from '../../domain/entities/shift-requirement';

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
