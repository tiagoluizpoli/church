import type {
  AssignmentId,
  ChurchId,
  RoleId,
  ShiftId,
  TimeSlotId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { ConflictIssue } from '../../conflict/types';
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

export interface AssignmentOverrideInput {
  reason: string;
}

export interface CreateParticipationAssignmentInput {
  churchId: ChurchId;
  shiftId: ShiftId;
  volunteerId: VolunteerId;
  roleId: RoleId;
  teamId?: string;
  actorId: UserId;
  override?: AssignmentOverrideInput;
}

export interface CreateParticipationAssignmentResult {
  assignment: Assignment;
  warnings: ConflictIssue[];
}

export interface ReassignParticipationAssignmentInput {
  churchId: ChurchId;
  assignmentId: AssignmentId;
  volunteerId: VolunteerId;
  actorId: UserId;
  reason: string;
}

export interface IAssignmentManager {
  createAssignment(input: CreateAssignmentInput): Promise<Assignment>;
  getAssignment(input: {
    assignmentId: AssignmentId;
    churchId: ChurchId;
  }): Promise<Assignment>;
  createParticipationAssignment(
    input: CreateParticipationAssignmentInput,
  ): Promise<CreateParticipationAssignmentResult>;
  overrideAssignment(input: {
    assignmentId: AssignmentId;
    churchId: ChurchId;
    actorId: UserId;
    reason: string;
  }): Promise<void>;
  reassignParticipationAssignment(
    input: ReassignParticipationAssignmentInput,
  ): Promise<Assignment>;
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
