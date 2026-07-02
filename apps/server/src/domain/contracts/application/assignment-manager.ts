import type {
  AssignmentId,
  ChurchId,
  RoleId,
  TimeSlotId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { AssignmentAudit } from '../../entities/assignment-audit';

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
