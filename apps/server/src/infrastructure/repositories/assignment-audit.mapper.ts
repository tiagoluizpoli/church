import type { AssignmentId, ChurchId, UserId } from '../../domain/branded-ids';
import type {
  AssignmentAuditId,
  AssignmentAuditProps,
} from '../../domain/entities/assignment-audit';
import { AssignmentAudit } from '../../domain/entities/assignment-audit';
import { assertEnum } from './mapper-utils';

const AUDIT_ACTIONS = [
  'created',
  'updated',
  'deleted',
  'status_change',
  'event_published',
  'event_cancelled',
] as const;

export function mapAssignmentAudit(row: {
  id: string;
  churchId: string;
  assignmentId: string;
  actorId: string;
  action: string;
  reason: string | null;
  timestamp: Date;
}): AssignmentAudit {
  const props: AssignmentAuditProps = {
    churchId: row.churchId as ChurchId,
    assignmentId: row.assignmentId as AssignmentId,
    actorId: row.actorId as UserId,
    action: assertEnum({
      field: 'action',
      value: row.action,
      valid: AUDIT_ACTIONS,
    }),
    reason: row.reason ?? undefined,
    timestamp: row.timestamp,
  };

  return new AssignmentAudit(props, row.id as AssignmentAuditId);
}
