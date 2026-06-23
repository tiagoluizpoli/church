// biome-ignore-all lint/suspicious/noExplicitAny: needed for test mocks
import type { AssignmentId } from '../../../src/domain/entities/assignment';
import { AssignmentAudit } from '../../../src/domain/entities/assignment-audit';
import type { ChurchId } from '../../../src/domain/entities/church';
import type { UserId } from '../../../src/domain/entities/volunteer';
import type {
  AssignmentAuditRepository,
  CreateAssignmentAuditInput,
} from '../../../src/domain/repositories/assignment-audit.repository';
import { runAssignmentAuditRepositoryContractTests } from '../../../src/domain/repositories/contract-tests/assignment-audit.contract-spec';

class MockAssignmentAuditRepository implements AssignmentAuditRepository {
  private audits = new Map<string, AssignmentAudit>();
  private idCounter = 1;

  constructor() {
    const au1 = new AssignmentAudit(
      {
        churchId: 'church-1' as ChurchId,
        assignmentId: 'assignment-1' as AssignmentId,
        actorId: 'user-1' as UserId,
        action: 'created',
        timestamp: new Date('2024-06-01T10:00:00Z'),
      },
      'audit-1' as any,
    );
    const au2 = new AssignmentAudit(
      {
        churchId: 'church-1' as ChurchId,
        assignmentId: 'assignment-1' as AssignmentId,
        actorId: 'user-1' as UserId,
        action: 'status_change',
        timestamp: new Date('2024-06-01T11:00:00Z'),
      },
      'audit-2' as any,
    );

    this.audits.set(au1.id, au1);
    this.audits.set(au2.id, au2);
  }

  async create(
    churchId: ChurchId,
    input: CreateAssignmentAuditInput,
  ): Promise<AssignmentAudit> {
    const id = `audit-gen-${this.idCounter++}` as any;
    const au = new AssignmentAudit(
      {
        churchId,
        assignmentId: input.assignmentId,
        actorId: input.actorId,
        action: input.action,
        reason: input.reason,
        overrideConflictTypes: input.overrideConflictTypes,
      },
      id,
    );
    this.audits.set(au.id, au);
    return au;
  }

  async listByAssignment(
    churchId: ChurchId,
    assignmentId: AssignmentId,
  ): Promise<AssignmentAudit[]> {
    return Array.from(this.audits.values())
      .filter(
        (au) => au.churchId === churchId && au.assignmentId === assignmentId,
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async listByChurch(churchId: ChurchId): Promise<AssignmentAudit[]> {
    return Array.from(this.audits.values())
      .filter((au) => au.churchId === churchId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async listByActor(
    churchId: ChurchId,
    actorId: UserId,
  ): Promise<AssignmentAudit[]> {
    return Array.from(this.audits.values())
      .filter((au) => au.churchId === churchId && au.actorId === actorId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}

runAssignmentAuditRepositoryContractTests(
  async () => new MockAssignmentAuditRepository(),
  async () => {},
);
