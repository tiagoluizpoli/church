import type { assignment } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  AssignmentId,
  ChurchId,
  RoleId,
  TimeSlotId,
  UserId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { AssignmentProps } from '../../domain/entities/assignment';
import { Assignment } from '../../domain/entities/assignment';

type AssignmentRow = InferSelectModel<typeof assignment>;

export function mapAssignment(row: AssignmentRow): Assignment {
  const props: AssignmentProps = {
    churchId: row.churchId as ChurchId,
    slotId: row.slotId as TimeSlotId,
    volunteerId: row.volunteerId as VolunteerId,
    roleId: row.roleId as RoleId,
    status: row.status as AssignmentProps['status'],
    reason: row.reason ?? undefined,
    assignedAt: row.assignedAt,
    assignedBy: row.assignedBy ? (row.assignedBy as UserId) : undefined,
  };

  return new Assignment(props, row.id as AssignmentId);
}
