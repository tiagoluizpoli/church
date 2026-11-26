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
import type { MinistryParticipation } from '../../entities/ministry-participation';
import type {
  IAssignmentFactsReader,
  IAssignmentLifecycle,
} from './assignment-lifecycle';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '@/domain/contracts/infrastructure/assignment-audit.repository';
import type { CycleRepository } from '@/domain/contracts/infrastructure/cycle.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { ShiftRepository } from '@/domain/contracts/infrastructure/shift.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';

export interface CreateParticipationAssignmentInput {
  churchId: ChurchId;
  shiftId: ShiftId;
  volunteerId: VolunteerId;
  actorId: UserId;
  shiftRequirementId: ShiftRequirementId;
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
}

export interface MoveParticipationAssignmentInput {
  churchId: ChurchId;
  assignmentId: AssignmentId;
  shiftRequirementId: ShiftRequirementId;
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
  moveParticipationAssignment(
    input: MoveParticipationAssignmentInput,
  ): Promise<Assignment>;
  deleteAssignment(input: DeleteAssignmentInput): Promise<void>;
  listAuditLogForCycle(
    input: ListCycleAuditLogInput,
  ): Promise<AssignmentAudit[]>;
}

export interface CreateParticipationAssignmentTransactionInput {
  input: CreateParticipationAssignmentInput;
  tx: TransactionContext;
  participation: MinistryParticipation;
  /** The Assignment a reassignment replaces; it does not take a place. */
  replacingId?: Assignment['id'];
}

export interface DbAssignmentManagerDependencies {
  assignmentRepo: AssignmentRepository;
  auditRepo: AssignmentAuditRepository;
  shiftRepository: ShiftRepository;
  participationRepository: MinistryParticipationRepository;
  cycleRepository: CycleRepository;
  assignmentLifecycle: IAssignmentLifecycle;
  assignmentFactsReader: IAssignmentFactsReader;
  unitOfWork: UnitOfWork;
}
