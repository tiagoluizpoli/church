import type { assignmentAudit } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type { AssignmentId } from '../../domain/entities/assignment';
import type {
  AssignmentAuditId,
  AssignmentAuditProps,
} from '../../domain/entities/assignment-audit';
import { AssignmentAudit } from '../../domain/entities/assignment-audit';
import type { ChurchId } from '../../domain/entities/church';
import type { UserId } from '../../domain/entities/volunteer';

type AssignmentAuditRow = InferSelectModel<typeof assignmentAudit>;

export function mapAssignmentAudit(row: AssignmentAuditRow): AssignmentAudit {
  const props: AssignmentAuditProps = {
    churchId: row.churchId as ChurchId,
    assignmentId: row.assignmentId as AssignmentId,
    actorId: row.actorId as UserId,
    action: row.action as AssignmentAuditProps['action'],
    reason: row.reason ?? undefined,
    timestamp: row.timestamp,
  };

  return new AssignmentAudit(props, row.id as AssignmentAuditId);
}
