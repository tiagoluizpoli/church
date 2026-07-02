import type { Assignment, AssignmentId } from '../../entities/assignment';
import type { AssignmentAudit } from '../../entities/assignment-audit';
import type { ChurchId } from '../../entities/church';
import type { RoleId } from '../../entities/role';
import type { TimeSlotId } from '../../entities/time-slot';
import type { UserId, VolunteerId } from '../../entities/volunteer';

export interface CreateAssignmentInput {
  churchId: ChurchId;
  slotId: TimeSlotId;
  volunteerId: VolunteerId;
  roleId: RoleId;
  actorId: UserId;
  reason?: string;
}

export interface IAssignmentManager {
  createAssignment(input: CreateAssignmentInput): Promise<Assignment>;
  overrideAssignment(input: {
    assignmentId: AssignmentId;
    churchId: ChurchId;
    actorId: UserId;
    reason: string;
  }): Promise<void>;
  deleteAssignment(input: {
    assignmentId: AssignmentId;
    churchId: ChurchId;
    actorId?: UserId;
  }): Promise<void>;
  listAuditLog(input: {
    assignmentId: AssignmentId;
    churchId: ChurchId;
  }): Promise<AssignmentAudit[]>;
}
