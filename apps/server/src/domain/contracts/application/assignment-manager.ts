import type {
  AssignmentId,
  ChurchId,
  CycleId,
  MinistryId,
  ShiftId,
  ShiftRequirementId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { ConflictIssue } from '../../conflict/types';
import type { Assignment } from '../../entities/assignment';
import type { AssignmentAudit } from '../../entities/assignment-audit';

interface CreateParticipationAssignmentInputBase {
  churchId: ChurchId;
  shiftId: ShiftId;
  volunteerId: VolunteerId;
  actorId: UserId;
}

export type CreateParticipationAssignmentInput =
  CreateParticipationAssignmentInputBase & {
    shiftRequirementId: ShiftRequirementId;
  };

export interface CreateParticipationAssignmentResult {
  assignment: Assignment;
  warnings: ConflictIssue[];
}

export interface ReassignParticipationAssignmentInput {
  churchId: ChurchId;
  assignmentId: AssignmentId;
  volunteerId: VolunteerId;
  actorId: UserId;
}

export interface GetAssignmentInput {
  assignmentId: AssignmentId;
  churchId: ChurchId;
}

export interface DeleteAssignmentInput {
  assignmentId: AssignmentId;
  churchId: ChurchId;
  actorId: UserId;
}

export interface ListCycleAuditLogInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
}

export interface IAssignmentManager {
  getAssignment(input: GetAssignmentInput): Promise<Assignment>;
  createParticipationAssignment(
    input: CreateParticipationAssignmentInput,
  ): Promise<CreateParticipationAssignmentResult>;
  reassignParticipationAssignment(
    input: ReassignParticipationAssignmentInput,
  ): Promise<Assignment>;
  deleteAssignment(input: DeleteAssignmentInput): Promise<void>;
  listAuditLogForCycle(
    input: ListCycleAuditLogInput,
  ): Promise<AssignmentAudit[]>;
}
