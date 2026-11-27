import { fromDate } from '@church/time';
import type { AssignmentId, ChurchId, UserId } from '../../domain/branded-ids';
import type {
  AssignmentAuditId,
  AssignmentAuditProps,
} from '../../domain/entities/assignment-audit';
import { AssignmentAudit } from '../../domain/entities/assignment-audit';
import type { AssignmentAuditRow } from './assignment-audit.mapper.types';

export function mapAssignmentAudit(row: AssignmentAuditRow): AssignmentAudit {
  const props: AssignmentAuditProps = {
    churchId: row.churchId as ChurchId,
    assignmentId: row.assignmentId as AssignmentId,
    actorId: row.actorId as UserId,
    action: row.action as AssignmentAuditProps['action'],
    reason: row.reason ?? undefined,
    occurredAt: fromDate({ date: row.timestamp }),
  };

  return new AssignmentAudit({ props, id: row.id as AssignmentAuditId });
}
