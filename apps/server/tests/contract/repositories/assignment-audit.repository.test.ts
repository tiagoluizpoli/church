// biome-ignore-all lint/suspicious/noExplicitAny: needed for test mocks
import type { AssignmentId } from '../../../src/domain/entities/assignment';
import { AssignmentAudit } from '../../../src/domain/entities/assignment-audit';
import type { ChurchId } from '../../../src/domain/entities/church';
import type { EventId } from '../../../src/domain/entities/event';
import type { UserId } from '../../../src/domain/entities/volunteer';
import type {
  AssignmentAuditLogEntry,
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
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        assignmentId: '99999999-9999-9999-9999-999999999991' as AssignmentId,
        actorId: '22222222-2222-2222-2222-222222222221' as UserId,
        action: 'created',
        timestamp: new Date('2024-06-01T10:00:00Z'),
      },
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1' as any,
    );
    const au2 = new AssignmentAudit(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        assignmentId: '99999999-9999-9999-9999-999999999991' as AssignmentId,
        actorId: '22222222-2222-2222-2222-222222222221' as UserId,
        action: 'status_change',
        timestamp: new Date('2024-06-01T11:00:00Z'),
      },
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2' as any,
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

  async listByEvent(
    _churchId: ChurchId,
    _eventId: EventId,
  ): Promise<AssignmentAuditLogEntry[]> {
    return [];
  }
}

runAssignmentAuditRepositoryContractTests(
  async () => new MockAssignmentAuditRepository(),
  async () => {},
);
