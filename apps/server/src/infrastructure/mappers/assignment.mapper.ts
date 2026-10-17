import type { assignment } from '@church/db';
import { fromDate } from '@church/time';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  AssignmentId,
  ChurchId,
  EventTimeBlockId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
  ShiftRequirementId,
  UserId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { AssignmentProps } from '../../domain/entities/assignment';
import { Assignment } from '../../domain/entities/assignment';

type AssignmentRow = InferSelectModel<typeof assignment>;

export function mapAssignment(
  row: AssignmentRow,
  eventTimeBlockId?: string,
): Assignment {
  const props: AssignmentProps = {
    churchId: row.churchId as ChurchId,
    participationId: row.participationId as MinistryParticipationId,
    shiftId: row.shiftId as ShiftId,
    eventTimeBlockId: (eventTimeBlockId ?? row.shiftId) as EventTimeBlockId,
    volunteerId: row.volunteerId as VolunteerId,
    roleId: row.roleId as RoleId,
    shiftRequirementId: row.shiftRequirementId as ShiftRequirementId,
    status: row.status as AssignmentProps['status'],
    reason: row.reason ?? undefined,
    assignedAt: fromDate({ date: row.assignedAt }),
    assignedBy: row.assignedBy ? (row.assignedBy as UserId) : undefined,
  };

  return new Assignment(props, row.id as AssignmentId);
}
