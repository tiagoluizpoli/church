import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type {
  CreateAssignmentInput,
  IAssignmentManager,
} from '../domain/contracts/application/assignment-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '../domain/contracts/infrastructure/assignment-audit.repository';
import type { Assignment, AssignmentId } from '../domain/entities/assignment';
import type { AssignmentAudit } from '../domain/entities/assignment-audit';
import type { ChurchId } from '../domain/entities/church';
import type { UserId } from '../domain/entities/volunteer';

@injectable()
export class DbAssignmentManager implements IAssignmentManager {
  constructor(
    @inject('IAssignmentRepository')
    private readonly assignmentRepo: AssignmentRepository,
    @inject('IAssignmentAuditRepository')
    private readonly auditRepo: AssignmentAuditRepository,
  ) {}

  async createAssignment(input: CreateAssignmentInput): Promise<Assignment> {
    const { churchId, slotId, volunteerId, roleId, actorId, reason } = input;
    const assignment = await this.assignmentRepo.create(churchId, {
      slotId,
      volunteerId,
      roleId,
      status: 'pending',
      reason,
      assignedBy: actorId,
    });
    await this.auditRepo.create(churchId, {
      assignmentId: assignment.id,
      actorId: actorId as UserId,
      action: 'created',
      reason,
    });
    return assignment;
  }

  async deleteAssignment(input: {
    assignmentId: AssignmentId;
    churchId: ChurchId;
    actorId?: UserId;
  }): Promise<void> {
    const { assignmentId, churchId, actorId } = input;
    await this.assignmentRepo.deleteById(churchId, assignmentId);
    if (actorId) {
      await this.auditRepo.create(churchId, {
        assignmentId,
        actorId,
        action: 'deleted',
      });
    }
  }

  async overrideAssignment(input: {
    assignmentId: AssignmentId;
    churchId: ChurchId;
    actorId: UserId;
    reason: string;
  }): Promise<void> {
    await this.assignmentRepo.getById(input.churchId, input.assignmentId);
    await this.auditRepo.create(input.churchId, {
      assignmentId: input.assignmentId,
      actorId: input.actorId,
      action: 'updated',
      reason: input.reason,
    });
  }

  async listAuditLog(input: {
    assignmentId: AssignmentId;
    churchId: ChurchId;
  }): Promise<AssignmentAudit[]> {
    return this.auditRepo.listByAssignment(input.churchId, input.assignmentId);
  }
}
