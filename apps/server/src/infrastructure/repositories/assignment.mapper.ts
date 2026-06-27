import type {
  AssignmentId,
  AssignmentProps,
} from '../../domain/entities/assignment';
import { Assignment } from '../../domain/entities/assignment';
import type { ChurchId } from '../../domain/entities/church';
import type { RoleId } from '../../domain/entities/role';
import type { TimeSlotId } from '../../domain/entities/time-slot';
import type { UserId, VolunteerId } from '../../domain/entities/volunteer';
import { assertEnum } from './mapper-utils';

const ASSIGNMENT_STATUSES = [
  'draft',
  'pending',
  'confirmed',
  'declined',
  'cancelled',
] as const;

export function mapAssignment(row: {
  id: string;
  churchId: string;
  slotId: string;
  volunteerId: string;
  roleId: string;
  status: string;
  reason: string | null;
  assignedAt: Date;
  assignedBy: string | null;
}): Assignment {
  const props: AssignmentProps = {
    churchId: row.churchId as ChurchId,
    slotId: row.slotId as TimeSlotId,
    volunteerId: row.volunteerId as VolunteerId,
    roleId: row.roleId as RoleId,
    status: assertEnum({
      field: 'status',
      value: row.status,
      valid: ASSIGNMENT_STATUSES,
    }),
    reason: row.reason ?? undefined,
    assignedAt: row.assignedAt,
    assignedBy: row.assignedBy ? (row.assignedBy as UserId) : undefined,
  };

  return new Assignment(props, row.id as AssignmentId);
}
