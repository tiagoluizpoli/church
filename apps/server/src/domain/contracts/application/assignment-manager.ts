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

export interface GetAssignmentInput {
  assignmentId: AssignmentId;
  churchId: ChurchId;
}

export interface OverrideAssignmentInput {
  assignmentId: AssignmentId;
  churchId: ChurchId;
  actorId: UserId;
  reason: string;
}

export interface DeleteAssignmentInput {
  assignmentId: AssignmentId;
  churchId: ChurchId;
  actorId: UserId;
}

export interface ListAssignmentAuditLogInput {
  assignmentId: AssignmentId;
  churchId: ChurchId;
}

export interface IAssignmentManager {
  createAssignment(input: CreateAssignmentInput): Promise<Assignment>;
  getAssignment(input: GetAssignmentInput): Promise<Assignment>;
  createParticipationAssignment(
    input: CreateParticipationAssignmentInput,
  ): Promise<CreateParticipationAssignmentResult>;
  overrideAssignment(input: OverrideAssignmentInput): Promise<void>;
  reassignParticipationAssignment(
    input: ReassignParticipationAssignmentInput,
  ): Promise<Assignment>;
  deleteAssignment(input: DeleteAssignmentInput): Promise<void>;
  listAuditLog(input: ListAssignmentAuditLogInput): Promise<AssignmentAudit[]>;
}
