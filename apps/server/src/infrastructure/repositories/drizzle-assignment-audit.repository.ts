import { assignmentAudit } from '@church/db';
import { and, desc, eq } from 'drizzle-orm';
import type { AssignmentId } from '../../domain/entities/assignment';
import type { AssignmentAudit } from '../../domain/entities/assignment-audit';
import type { ChurchId } from '../../domain/entities/church';
import type { UserId } from '../../domain/entities/volunteer';
import type {
  AssignmentAuditRepository,
  CreateAssignmentAuditInput,
} from '../../domain/repositories/assignment-audit.repository';
import type { TransactionContext } from '../../domain/repositories/transaction-context';
import { getClient, withChurchIsolation } from './helpers';
import { mapAssignmentAudit } from './mappers';
import type { AnyDrizzleDb } from './types';

export class DrizzleAssignmentAuditRepository
  implements AssignmentAuditRepository
{
  constructor(private readonly db: AnyDrizzleDb) {}

  async create(
    churchId: ChurchId,
    input: CreateAssignmentAuditInput,
    tx?: TransactionContext,
  ): Promise<AssignmentAudit> {
    const [row] = await getClient(this.db, tx)
      .insert(assignmentAudit)
      .values({
        churchId,
        assignmentId: input.assignmentId,
        actorId: input.actorId,
        action: (input.action === 'event_published' ||
        input.action === 'event_cancelled'
          ? 'status_change'
          : input.action) as
          | 'created'
          | 'updated'
          | 'deleted'
          | 'status_change',
        reason: input.reason ?? null,
        timestamp: new Date(),
      })
      .returning();
    if (!row) throw new Error('AssignmentAudit insert failed');
    return mapAssignmentAudit(row);
  }

  async listByAssignment(
    churchId: ChurchId,
    assignmentId: AssignmentId,
    tx?: TransactionContext,
  ): Promise<AssignmentAudit[]> {
    const rows = await getClient(this.db, tx)
      .select()
      .from(assignmentAudit)
      .where(
        and(
          withChurchIsolation(assignmentAudit, churchId),
          eq(assignmentAudit.assignmentId, assignmentId),
        ),
      )
      .orderBy(desc(assignmentAudit.timestamp));
    return rows.map(mapAssignmentAudit);
  }

  async listByChurch(
    churchId: ChurchId,
    tx?: TransactionContext,
  ): Promise<AssignmentAudit[]> {
    const rows = await getClient(this.db, tx)
      .select()
      .from(assignmentAudit)
      .where(withChurchIsolation(assignmentAudit, churchId))
      .orderBy(desc(assignmentAudit.timestamp));
    return rows.map(mapAssignmentAudit);
  }

  async listByActor(
    churchId: ChurchId,
    actorId: UserId,
    tx?: TransactionContext,
  ): Promise<AssignmentAudit[]> {
    const rows = await getClient(this.db, tx)
      .select()
      .from(assignmentAudit)
      .where(
        and(
          withChurchIsolation(assignmentAudit, churchId),
          eq(assignmentAudit.actorId, actorId),
        ),
      )
      .orderBy(desc(assignmentAudit.timestamp));
    return rows.map(mapAssignmentAudit);
  }
}
