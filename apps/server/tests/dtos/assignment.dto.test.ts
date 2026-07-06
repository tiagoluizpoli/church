import { describe, expect, it } from 'vitest';
import { assignmentMapper } from '../../src/api/dtos/assignment.dto';
import { Assignment } from '../../src/domain/entities/assignment';
import { AssignmentAudit } from '../../src/domain/entities/assignment-audit';

describe('assignmentMapper', () => {
  describe('toResponse', () => {
    it('maps an assignment with all optional fields present', () => {
      const assignedAt = new Date('2026-01-01T00:00:00.000Z');
      const assignment = new Assignment(
        {
          churchId: 'c1',
          slotId: 's1',
          participationId: 'p1',
          shiftId: 'sh1',
          volunteerId: 'v1',
          roleId: 'r1',
          status: 'confirmed',
          reason: 'because',
          assignedAt,
          assignedBy: 'u1',
        },
        'a1',
      );

      const response = assignmentMapper.toResponse(assignment);

      expect(response).toEqual({
        id: 'a1',
        churchId: 'c1',
        slotId: 's1',
        participationId: 'p1',
        shiftId: 'sh1',
        volunteerId: 'v1',
        roleId: 'r1',
        status: 'confirmed',
        reason: 'because',
        assignedAt: assignedAt.toISOString(),
        assignedBy: 'u1',
      });
    });

    it('maps an assignment with optional fields absent', () => {
      const assignment = new Assignment(
        {
          churchId: 'c1',
          slotId: 's1',
          volunteerId: 'v1',
          roleId: 'r1',
        },
        'a1',
      );

      const response = assignmentMapper.toResponse(assignment);

      expect(response.participationId).toBeUndefined();
      expect(response.shiftId).toBeUndefined();
      expect(response.reason).toBeUndefined();
      expect(response.assignedBy).toBeUndefined();
      expect(response.status).toBe('draft');
    });
  });

  describe('auditToResponse', () => {
    it('maps an audit with reason present', () => {
      const timestamp = new Date('2026-02-01T00:00:00.000Z');
      const audit = new AssignmentAudit(
        {
          churchId: 'c1',
          assignmentId: 'a1',
          actorId: 'u1',
          action: 'created',
          reason: 'setup',
          timestamp,
        },
        'aud1',
      );

      const response = assignmentMapper.auditToResponse(audit);

      expect(response).toEqual({
        id: 'aud1',
        assignmentId: 'a1',
        actorId: 'u1',
        action: 'created',
        reason: 'setup',
        timestamp: timestamp.toISOString(),
      });
    });

    it('maps an audit with reason absent', () => {
      const audit = new AssignmentAudit(
        {
          churchId: 'c1',
          assignmentId: 'a1',
          actorId: 'u1',
          action: 'status_change',
        },
        'aud2',
      );

      const response = assignmentMapper.auditToResponse(audit);

      expect(response.reason).toBeUndefined();
      expect(response.action).toBe('status_change');
    });
  });

  describe('auditListToResponse', () => {
    it('maps a list of audits', () => {
      const audit1 = new AssignmentAudit(
        {
          churchId: 'c1',
          assignmentId: 'a1',
          actorId: 'u1',
          action: 'created',
        },
        'aud1',
      );
      const audit2 = new AssignmentAudit(
        {
          churchId: 'c1',
          assignmentId: 'a1',
          actorId: 'u1',
          action: 'deleted',
          reason: 'removed',
        },
        'aud2',
      );

      const response = assignmentMapper.auditListToResponse([audit1, audit2]);

      expect(response.items).toHaveLength(2);
      expect(response.items[0]?.id).toBe('aud1');
      expect(response.items[1]?.reason).toBe('removed');
    });

    it('maps an empty list', () => {
      const response = assignmentMapper.auditListToResponse([]);

      expect(response.items).toEqual([]);
    });
  });
});
