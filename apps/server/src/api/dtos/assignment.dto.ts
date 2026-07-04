import { z } from 'zod';
import type { Assignment } from '../../domain/entities/assignment';
import type { AssignmentAudit } from '../../domain/entities/assignment-audit';

export const createAssignmentBodySchema = z.object({
  slotId: z.string(),
  volunteerId: z.string(),
  roleId: z.string(),
  reason: z.string().optional(),
});

export const overrideAssignmentBodySchema = z.object({
  reason: z.string().trim().min(10),
});

export const assignmentResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  slotId: z.string(),
  participationId: z.string().optional(),
  shiftId: z.string().optional(),
  volunteerId: z.string(),
  roleId: z.string(),
  status: z.enum(['draft', 'pending', 'confirmed', 'declined', 'cancelled']),
  reason: z.string().optional(),
  assignedAt: z.string(),
  assignedBy: z.string().optional(),
});
export type AssignmentResponse = z.infer<typeof assignmentResponseSchema>;

export const assignmentAuditResponseSchema = z.object({
  id: z.string(),
  assignmentId: z.string(),
  actorId: z.string(),
  action: z.enum([
    'created',
    'updated',
    'deleted',
    'status_change',
    'event_published',
    'event_cancelled',
  ]),
  reason: z.string().optional(),
  timestamp: z.string(),
});
export type AssignmentAuditResponse = z.infer<
  typeof assignmentAuditResponseSchema
>;

export const auditListResponseSchema = z.object({
  items: z.array(assignmentAuditResponseSchema),
});

function toAssignmentResponse(a: Assignment): AssignmentResponse {
  return {
    id: a.id as string,
    churchId: a.churchId as string,
    slotId: a.slotId as string,
    participationId: a.participationId as string | undefined,
    shiftId: a.shiftId as string | undefined,
    volunteerId: a.volunteerId as string,
    roleId: a.roleId as string,
    status: a.status,
    reason: a.reason,
    assignedAt: a.assignedAt.toISOString(),
    assignedBy: a.assignedBy as string | undefined,
  };
}

function toAuditResponse(a: AssignmentAudit): AssignmentAuditResponse {
  return {
    id: a.id as string,
    assignmentId: a.assignmentId as string,
    actorId: a.actorId as string,
    action: a.action,
    reason: a.reason,
    timestamp: a.timestamp.toISOString(),
  };
}

export const assignmentMapper = {
  toResponse: toAssignmentResponse,
  auditToResponse: toAuditResponse,
  auditListToResponse(items: AssignmentAudit[]) {
    return { items: items.map(toAuditResponse) };
  },
};
