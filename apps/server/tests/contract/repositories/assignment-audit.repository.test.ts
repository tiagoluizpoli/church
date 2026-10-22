// biome-ignore-all lint/suspicious/noExplicitAny: needed for test mocks

import { compareInstants, parseInstant } from '@church/time';
import type { AssignmentId, ChurchId, UserId } from '@/domain/branded-ids';
import type {
  AssignmentAuditLogEntry,
  AssignmentAuditRepository,
  CreateAssignmentAuditRepositoryInput,
  ListAuditByActorInput,
  ListAuditByChurchInput,
  ListAuditByEventInput,
} from '@/domain/contracts/infrastructure/assignment-audit.repository';
import { AssignmentAudit } from '@/domain/entities/assignment-audit';
import { runAssignmentAuditRepositoryContractTests } from '@/tests/domain/contracts/contract-tests/assignment-audit.contract-spec';

class MockAssignmentAuditRepository implements AssignmentAuditRepository {
  private audits = new Map<string, AssignmentAudit>();
  private idCounter = 1;

  constructor() {
    const au1 = new AssignmentAudit({
      props: {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        assignmentId: '99999999-9999-9999-9999-999999999991' as AssignmentId,
        actorId: '22222222-2222-2222-2222-222222222221' as UserId,
        action: 'created',
        occurredAt: parseInstant({ value: '2024-06-01T10:00:00Z' }),
      },
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1' as any,
    });
    const au2 = new AssignmentAudit({
      props: {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        assignmentId: '99999999-9999-9999-9999-999999999991' as AssignmentId,
        actorId: '22222222-2222-2222-2222-222222222221' as UserId,
        action: 'status_change',
        occurredAt: parseInstant({ value: '2024-06-01T11:00:00Z' }),
      },
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2' as any,
    });

    this.audits.set(au1.id, au1);
    this.audits.set(au2.id, au2);
  }

  async create({
    churchId,
    input,
  }: CreateAssignmentAuditRepositoryInput): Promise<AssignmentAudit> {
    const id = `audit-gen-${this.idCounter++}` as any;
    const au = new AssignmentAudit({
      props: {
        churchId,
        assignmentId: input.assignmentId,
        actorId: input.actorId,
        action: input.action,
        reason: input.reason,
        overrideConflictTypes: input.overrideConflictTypes,
      },
      id,
    });
    this.audits.set(au.id, au);
    return au;
  }

  async listByChurch({
    churchId,
  }: ListAuditByChurchInput): Promise<AssignmentAudit[]> {
    return Array.from(this.audits.values())
      .filter((au) => au.churchId === churchId)
      .sort((a, b) =>
        compareInstants({ left: b.occurredAt, right: a.occurredAt }),
      );
  }

  async listByActor({
    churchId,
    actorId,
  }: ListAuditByActorInput): Promise<AssignmentAudit[]> {
    return Array.from(this.audits.values())
      .filter((au) => au.churchId === churchId && au.actorId === actorId)
      .sort((a, b) =>
        compareInstants({ left: b.occurredAt, right: a.occurredAt }),
      );
  }

  async listByCycle(): Promise<AssignmentAudit[]> {
    return [];
  }

  async listByEvent(
    _input: ListAuditByEventInput,
  ): Promise<AssignmentAuditLogEntry[]> {
    return [];
  }
}

runAssignmentAuditRepositoryContractTests(
  async () => new MockAssignmentAuditRepository(),
  async () => {},
);
