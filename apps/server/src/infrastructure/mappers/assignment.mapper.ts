import type { assignment } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  AssignmentId,
  ChurchId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
  TimeSlotId,
  UserId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { AssignmentProps } from '../../domain/entities/assignment';
import { Assignment } from '../../domain/entities/assignment';

type AssignmentRow = InferSelectModel<typeof assignment>;

export function mapAssignment(
  row: AssignmentRow,
  timeSlotId?: string,
): Assignment {
  const props: AssignmentProps = {
    churchId: row.churchId as ChurchId,
    participationId: row.participationId as MinistryParticipationId,
    shiftId: row.shiftId as ShiftId,
    slotId: (timeSlotId ?? row.shiftId) as TimeSlotId,
    volunteerId: row.volunteerId as VolunteerId,
    roleId: row.roleId as RoleId,
    status: row.status as AssignmentProps['status'],
    reason: row.reason ?? undefined,
    assignedAt: row.assignedAt,
    assignedBy: row.assignedBy ? (row.assignedBy as UserId) : undefined,
  };

  return new Assignment(props, row.id as AssignmentId);
}
