import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AssignmentId } from '../../entities/assignment';
import type { ChurchId } from '../../entities/church';
import type { UserId } from '../../entities/volunteer';
import type { AssignmentAuditRepository } from '../assignment-audit.repository';

export function runAssignmentAuditRepositoryContractTests(
  factory: () => Promise<AssignmentAuditRepository>,
  cleanup: () => Promise<void> = async () => {},
) {
  describe('AssignmentAuditRepository Contract', () => {
    let repo: AssignmentAuditRepository;

    beforeEach(async () => {
      repo = await factory();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('should create an assignment audit', async () => {
      const created = await repo.create('church-1' as ChurchId, {
        assignmentId: 'assignment-1' as AssignmentId,
        actorId: 'user-1' as UserId,
        action: 'status_change',
        reason: 'Test audit creation',
      });

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.action).toBe('status_change');
    });

    it('should list audits by assignment newest-first', async () => {
      const list = await repo.listByAssignment(
        'church-1' as ChurchId,
        'assignment-1' as AssignmentId,
      );
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0].id).toBe('audit-2'); // 11:00:00 is newer than 10:00:00
      expect(list[1].id).toBe('audit-1');
    });

    it('should list audits by church newest-first', async () => {
      const list = await repo.listByChurch('church-1' as ChurchId);
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0].id).toBe('audit-2');
    });

    it('should list audits by actor newest-first', async () => {
      const list = await repo.listByActor(
        'church-1' as ChurchId,
        'user-1' as UserId,
      );
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0].id).toBe('audit-2');
    });
  });
}
