import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AssignmentId, ChurchId, UserId } from '../../branded-ids';
import type { AssignmentAuditRepository } from '../infrastructure/assignment-audit.repository';

export function runAssignmentAuditRepositoryContractTests(
  factory: () => Promise<AssignmentAuditRepository>,
  cleanup: () => Promise<void>,
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
      const created = await repo.create(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        {
          assignmentId: '99999999-9999-9999-9999-999999999991' as AssignmentId,
          actorId: '22222222-2222-2222-2222-222222222221' as UserId,
          action: 'status_change',
          reason: 'Test audit creation',
        },
      );

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.action).toBe('status_change');
    });

    it('should list audits by church newest-first', async () => {
      const list = await repo.listByChurch(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
      );
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0]?.id).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2');
    });

    it('should list audits by actor newest-first', async () => {
      const list = await repo.listByActor(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '22222222-2222-2222-2222-222222222221' as UserId,
      );
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0]?.id).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2');
    });
  });
}
